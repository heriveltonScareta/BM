import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../setup/db";
import { asUser, callRoute, createTestUsers } from "../setup/session";
import { CNPJ_A, createClientFixture } from "../setup/fixtures";
import { addItem, createMeasurement } from "@/lib/services/measurement.service";
import { createMeasurementSchema, laborItemSchema } from "@/lib/validation/measurement";
import { setEmailProviderForTests, type EmailMessage } from "@/lib/email";
import { MeasurementStatus as S } from "@/lib/db/generated/enums";
import { POST as enviarPOST } from "@/app/api/medicoes/[id]/enviar/route";
import { GET as portalGET } from "@/app/api/portal/[token]/route";
import { POST as decidirPOST } from "@/app/api/portal/[token]/decidir/route";
import { POST as assinarPOST } from "@/app/api/portal/[token]/assinar/route";
import { GET as portalPdfGET } from "@/app/api/portal/[token]/pdf/route";

const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) });
const json = (body: unknown, ip = "1.2.3.4") =>
  new Request("http://localhost/x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": ip, "user-agent": "vitest" },
  });

describe("API do portal e envio", () => {
  const sent: EmailMessage[] = [];
  let users: Awaited<ReturnType<typeof createTestUsers>>;
  let id = "";
  let token = "";

  beforeAll(async () => {
    await resetDatabase();
    setEmailProviderForTests({
      name: "fake",
      async send(m) {
        sent.push(m);
        return { id: "1" };
      },
    });
    const a = await createClientFixture("AAA", CNPJ_A);
    users = await createTestUsers(a.client.id);
    const m = await createMeasurement(
      users.admin,
      createMeasurementSchema.parse({
        clientId: a.client.id,
        contractId: a.contract.id,
        competence: "09/2026",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        issueDate: "2026-09-30",
      }),
      { label: "t" },
    );
    id = m.id;
    await addItem(
      { kind: "ALL" },
      id,
      "mao-de-obra",
      laborItemSchema.parse({ code: "X", role: "X", quantity: "2", unit: "h", unitPrice: "100" }),
      { label: "t" },
    );
    await prisma.measurement.update({ where: { id }, data: { status: S.AGUARDANDO_ENVIO } });
  });

  afterAll(async () => {
    asUser(null);
    setEmailProviderForTests(undefined);
    await prisma.$disconnect();
  });

  it("enviar: só Admin; resposta traz destinatário, validade e (em dev) o link", async () => {
    for (const u of [users.operacional, users.financeiro, users.cliente]) {
      asUser(u);
      expect(
        (await callRoute(enviarPOST, { method: "POST", path: "/x", params: { id } })).status,
      ).toBe(403);
    }
    asUser(users.admin);
    const r = await callRoute(enviarPOST, { method: "POST", path: "/x", params: { id }, body: {} });
    expect(r.status).toBe(200);
    const body = r.json as {
      version: number;
      sentTo: { email: string };
      portalUrl?: string;
      emailSent: boolean;
    };
    expect(body).toMatchObject({ version: 1, emailSent: true });
    token = body.portalUrl!.split("/").pop()!;
    expect(token).toHaveLength(43);
    expect(
      (await callRoute(enviarPOST, { method: "POST", path: "/x", params: { id }, body: {} }))
        .status,
    ).toBe(409); // ja enviada
  });

  it("portal: estado, decisão com validação, assinatura exige ciência, PDF por token", async () => {
    const view = await portalGET(
      new Request("http://localhost/x", { headers: { "x-forwarded-for": "9.9.9.9" } }),
      ctx({ token }),
    );
    expect(view.status).toBe(200);
    expect(((await view.json()) as { state: string }).state).toBe("AGUARDANDO_DECISAO");

    const semComentario = await decidirPOST(
      json({ decision: "CORRIGIR", comment: "" }, "9.9.9.9"),
      ctx({ token }),
    );
    expect(semComentario.status).toBe(422);
    const aprova = await decidirPOST(json({ decision: "APROVAR" }, "9.9.9.9"), ctx({ token }));
    expect(aprova.status).toBe(200);
    expect(((await aprova.json()) as { state: string }).state).toBe("AGUARDANDO_ASSINATURA");
    expect(
      (await decidirPOST(json({ decision: "APROVAR" }, "9.9.9.9"), ctx({ token }))).status,
    ).toBe(409);

    const semCiencia = await assinarPOST(
      json({ signerName: "Fulano", accepted: false }, "9.9.9.9"),
      ctx({ token }),
    );
    expect(semCiencia.status).toBe(422);
    const assina = await assinarPOST(
      json({ signerName: "Fulano de Tal", accepted: true }, "9.9.9.9"),
      ctx({ token }),
    );
    expect(assina.status).toBe(200);
    const signed = (await assina.json()) as { state: string; signature: { signerName: string } };
    expect(signed.state).toBe("ASSINADO");
    expect(signed.signature.signerName).toBe("Fulano de Tal");
    const sig = await prisma.signature.findFirstOrThrow({ where: { measurementId: id } });
    expect(sig.ipAddress).toBe("9.9.9.9");
    expect(sig.userAgent).toBe("vitest");

    const pdf = await portalPdfGET(
      new Request("http://localhost/x", { headers: { "x-forwarded-for": "9.9.9.9" } }),
      ctx({ token }),
    );
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-disposition")).toContain("assinado.pdf");
  });

  it("rate limit: mais de 10 acessos por minuto ao mesmo token são bloqueados (429)", async () => {
    let bloqueado = 0;
    for (let i = 0; i < 12; i++) {
      const r = await portalGET(
        new Request("http://localhost/x", { headers: { "x-forwarded-for": `10.0.0.${i}` } }),
        ctx({ token }),
      );
      if (r.status === 429) bloqueado += 1;
    }
    expect(bloqueado).toBeGreaterThan(0);
  });
});
