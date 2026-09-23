import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../setup/db";
import { createTestUsers } from "../setup/session";
import { CNPJ_A, CNPJ_B, createClientFixture } from "../setup/fixtures";
import { extractPdfText } from "../setup/pdf-text";
import {
  addItem,
  createMeasurement,
  getMeasurement,
  transitionMeasurement,
  updateItem,
} from "@/lib/services/measurement.service";
import {
  compareVersions,
  decidePortal,
  getApprovalStatus,
  getPortal,
  getPortalPdf,
  getVersionPdf,
  listVersions,
  openPortal,
  resendApproval,
  sendToClient,
  signPortal,
} from "@/lib/services/approval.service";
import { getDocumentForDownload } from "@/lib/services/document.service";
import { createMeasurementSchema, laborItemSchema } from "@/lib/validation/measurement";
import { setEmailProviderForTests, type EmailMessage } from "@/lib/email";
import { MeasurementStatus as S } from "@/lib/db/generated/enums";
import { AppError, NotFoundError, TransitionError } from "@/lib/errors";
import type { Scope } from "@/lib/auth/scope";
import { sha256Hex } from "@/lib/pdf/render";

const ALL: Scope = { kind: "ALL" };
const actor = { label: "teste", ip: "10.0.0.9" };
const meta = { ip: "177.1.2.3", userAgent: "Vitest/1.0" };

function tokenFrom(msg: EmailMessage): string {
  return msg.text.match(/\/portal\/aprovacao\/([A-Za-z0-9_-]+)/)?.[1] ?? "";
}

describe("aprovação e assinatura", () => {
  const sent: EmailMessage[] = [];
  let users: Awaited<ReturnType<typeof createTestUsers>>;
  let a: Awaited<ReturnType<typeof createClientFixture>>;
  let id = "";
  let itemId = "";

  beforeAll(async () => {
    await resetDatabase();
    setEmailProviderForTests({
      name: "fake",
      async send(m) {
        sent.push(m);
        return { id: String(sent.length) };
      },
    });
    a = await createClientFixture("AAA", CNPJ_A);
    await createClientFixture("BBB", CNPJ_B);
    users = await createTestUsers(a.client.id);
    const m = await createMeasurement(
      users.admin,
      createMeasurementSchema.parse({
        clientId: a.client.id,
        contractId: a.contract.id,
        competence: "08/2026",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        issueDate: "2026-08-31",
        frs: "FRS-AP",
      }),
      actor,
    );
    id = m.id;
    const item = await addItem(
      ALL,
      id,
      "mao-de-obra",
      laborItemSchema.parse({
        code: "MO-1",
        role: "Blaster",
        quantity: "10",
        unit: "h",
        unitPrice: "55",
      }),
      actor,
    );
    itemId = item.item.id;
    await transitionMeasurement(users.admin, ALL, id, S.EM_ELABORACAO, actor);
  });

  afterAll(async () => {
    setEmailProviderForTests(undefined);
    await prisma.$disconnect();
  });

  it("não envia fora de AGUARDANDO_ENVIO, sem itens ou sem aprovador; operacional não envia", async () => {
    await expect(sendToClient(users.admin, ALL, id, {}, actor)).rejects.toBeInstanceOf(
      TransitionError,
    );
    await transitionMeasurement(users.admin, ALL, id, S.AGUARDANDO_ENVIO, actor);
    await expect(sendToClient(users.operacional, ALL, id, {}, actor)).rejects.toBeInstanceOf(
      TransitionError,
    );
    await prisma.clientContact.updateMany({
      where: { clientId: a.client.id },
      data: { isApprover: false },
    });
    await expect(sendToClient(users.admin, ALL, id, {}, actor)).rejects.toThrow(/aprovador/);
    await prisma.clientContact.updateMany({
      where: { clientId: a.client.id },
      data: { isApprover: true },
    });
  });

  it("envia: congela v1 com PDF, token hash de 32 bytes com 7 dias, e-mail com link", async () => {
    const r = await sendToClient(users.admin, ALL, id, {}, actor);
    expect(r).toMatchObject({
      status: S.ENVIADO_AO_CLIENTE,
      version: 1,
      emailSent: true,
      sentTo: { email: a.approver.email },
    });
    expect(r.portalUrl).toMatch(/\/portal\/aprovacao\/[A-Za-z0-9_-]{43}$/);
    expect(sent).toHaveLength(1);
    const token = tokenFrom(sent[0]!);
    expect(token.length).toBe(43);
    const req = await prisma.approvalRequest.findFirstOrThrow({ where: { measurementId: id } });
    expect(req.tokenHash).not.toBe(token);
    expect(req.tokenHash).toHaveLength(64);
    expect(Math.round((req.expiresAt.getTime() - req.sentAt.getTime()) / 86_400_000)).toBe(7);
    const m = await getMeasurement(ALL, id);
    expect(m.currentVersion).toBe(1);
    const versions = await listVersions(ALL, id);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, totalAmount: "550.00", laborCount: 1 });
    const doc = await prisma.document.findFirstOrThrow({
      where: { measurementId: id, type: "BOLETIM" },
    });
    expect(doc.fileName).toBe(`${m.number}-v1.pdf`);
    expect(doc.storageKey).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    const { data } = await getDocumentForDownload(ALL, doc.id);
    expect(sha256Hex(data)).toBe(doc.checksum);
    // itens bloqueados
    await expect(
      updateItem(
        ALL,
        id,
        "mao-de-obra",
        itemId,
        laborItemSchema.parse({
          code: "MO-1",
          role: "X",
          quantity: "1",
          unit: "h",
          unitPrice: "1",
        }),
        actor,
      ),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("token inexistente e expirado são rejeitados; abrir registra EM_APROVACAO uma única vez", async () => {
    await expect(openPortal("a".repeat(43), meta)).rejects.toBeInstanceOf(NotFoundError);
    const token = tokenFrom(sent[0]!);
    await prisma.approvalRequest.updateMany({
      where: { measurementId: id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(openPortal(token, meta)).rejects.toMatchObject({ status: 410 });
    await prisma.approvalRequest.updateMany({
      where: { measurementId: id },
      data: { expiresAt: new Date(Date.now() + 86_400_000) },
    });

    const v1 = await openPortal(token, meta);
    expect(v1.state).toBe("AGUARDANDO_DECISAO");
    expect(v1.measurement.status).toBe(S.EM_APROVACAO);
    expect(v1.request.openedAt).toBeInstanceOf(Date);
    expect(v1.version.snapshot.totals.totalAmount).toBe("550.00");
    const v2 = await openPortal(token, meta);
    expect(v2.request.openedAt?.getTime()).toBe(v1.request.openedAt?.getTime());
    expect(
      await prisma.auditLog.count({ where: { entityId: id, action: "ABERTO_PELO_CLIENTE" } }),
    ).toBe(1);
  });

  it("correção solicitada exige comentário, é de uso único; reabrir permite editar e reenviar gera v2", async () => {
    const token = tokenFrom(sent[0]!);
    const v = await decidePortal(token, "CORRIGIR", "Rever horas do blaster", meta);
    expect(v.state).toBe("CORRECAO_SOLICITADA");
    expect(v.measurement.status).toBe(S.CORRECAO_SOLICITADA);
    await expect(decidePortal(token, "APROVAR", "", meta)).rejects.toMatchObject({
      code: "TOKEN_USED",
    });
    await expect(signPortal(token, { signerName: "X" }, meta)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });

    // operacional reabre (nova versao em elaboracao) e edita
    await transitionMeasurement(users.operacional, ALL, id, S.EM_ELABORACAO, actor);
    await updateItem(
      ALL,
      id,
      "mao-de-obra",
      itemId,
      laborItemSchema.parse({
        code: "MO-1",
        role: "Blaster",
        quantity: "8",
        unit: "h",
        unitPrice: "55",
      }),
      actor,
    );
    await addItem(
      ALL,
      id,
      "mao-de-obra",
      laborItemSchema.parse({
        code: "MO-2",
        role: "Ajudante",
        quantity: "8",
        unit: "h",
        unitPrice: "20",
      }),
      actor,
    );
    expect((await getPortal(token)).state).toBe("SUBSTITUIDA");
    await transitionMeasurement(users.operacional, ALL, id, S.AGUARDANDO_ENVIO, actor);
    const r2 = await sendToClient(users.admin, ALL, id, { contactId: a.approver.id }, actor);
    expect(r2.version).toBe(2);
    expect(sent).toHaveLength(2);
    expect((await getMeasurement(ALL, id)).currentVersion).toBe(2);

    const cmp = await compareVersions(ALL, id, 1, 2);
    expect(cmp.totais.find((t) => t.campo === "totalAmount")).toMatchObject({
      a: "550.00",
      b: "600.00",
      diferenca: "50.00",
    });
    expect(cmp.maoDeObra.adicionados.map((i) => i.code)).toEqual(["MO-2"]);
    expect(cmp.maoDeObra.removidos).toEqual([]);
    expect(cmp.maoDeObra.alterados).toHaveLength(1);
    expect(cmp.maoDeObra.alterados[0]?.campos.map((c) => c.campo)).toEqual([
      "quantity",
      "totalPrice",
    ]);
    await expect(compareVersions(ALL, id, 1, 3)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("reenvio invalida o link anterior; aprovar e assinar gera evidências e PDF assinado", async () => {
    const tokenV2 = tokenFrom(sent[1]!);
    await openPortal(tokenV2, meta);
    const resent = await resendApproval(users.admin, ALL, id, {}, actor);
    expect(resent.version).toBe(2);
    await expect(getPortal(tokenV2)).rejects.toMatchObject({ status: 410 });
    await expect(resendApproval(users.operacional, ALL, id, {}, actor)).rejects.toMatchObject({
      status: 403,
    });
    const token = tokenFrom(sent[2]!);

    const approved = await decidePortal(token, "APROVAR", "", meta);
    expect(approved.state).toBe("AGUARDANDO_ASSINATURA");
    expect(approved.measurement.status).toBe(S.APROVADO);

    const signed = await signPortal(token, { signerName: "Carla Menezes" }, meta);
    expect(signed.state).toBe("ASSINADO");
    expect(signed.measurement.status).toBe(S.ASSINADO);
    expect(signed.signature).toMatchObject({
      signerName: "Carla Menezes",
      signerEmail: a.approver.email,
    });
    expect(signed.signature?.documentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(signed.signature?.signedDocumentId).toBeTruthy();

    const sig = await prisma.signature.findFirstOrThrow({ where: { measurementId: id } });
    expect(sig).toMatchObject({ ipAddress: "177.1.2.3", userAgent: "Vitest/1.0" });
    // hash = SHA-256 do PDF da versao aprovada
    const versionPdf = await getVersionPdf(ALL, id, 2);
    expect(sha256Hex(versionPdf.data)).toBe(sig.documentHash);
    // PDF assinado com bloco de evidencias, sem marca d'agua
    const { data } = await getDocumentForDownload(ALL, signed.signature!.signedDocumentId!);
    const { text } = await extractPdfText(data);
    expect(text).toMatch(/Evidências da assinatura eletrônica/i);
    expect(text).toContain("Carla Menezes");
    expect(text).toMatch(/177\s?\.1\.2\.3/);
    expect(text).toContain(sig.documentHash);
    expect(text).not.toContain("RASCUNHO");
    expect(text).not.toContain("certificado");
    const portalPdf = await getPortalPdf(token);
    expect(portalPdf.fileName).toContain("assinado");

    await expect(signPortal(token, { signerName: "De novo" }, meta)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    const status = await getApprovalStatus(ALL, id);
    expect(status.signature?.version).toBe(2);
    expect(status.request?.decision).toBe("APPROVED");
    const actions = (
      await prisma.auditLog.findMany({
        where: { OR: [{ entityId: id }, { after: { path: ["measurementId"], equals: id } }] },
      })
    ).map((l) => l.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "VERSAO_CRIADA",
        "ENVIADO_AO_CLIENTE",
        "ABERTO_PELO_CLIENTE",
        "CORRECAO_SOLICITADA",
        "APROVADO",
        "ASSINADO",
        "DOCUMENTO_ENVIADO",
      ]),
    );
  });

  it("isolamento: cliente B não vê versões, documentos nem PDF da medição de A", async () => {
    const cliB: Scope = {
      kind: "CLIENT",
      clientId: (await prisma.client.findFirstOrThrow({ where: { code: "BBB" } })).id,
    };
    const cliA: Scope = { kind: "CLIENT", clientId: a.client.id };
    await expect(listVersions(cliB, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getVersionPdf(cliB, id, 2)).rejects.toBeInstanceOf(NotFoundError);
    await expect(compareVersions(cliB, id, 1, 2)).rejects.toBeInstanceOf(NotFoundError);
    const doc = await prisma.document.findFirstOrThrow({
      where: { measurementId: id, type: "BOLETIM_ASSINADO" },
    });
    await expect(getDocumentForDownload(cliB, doc.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await getDocumentForDownload(cliA, doc.id)).doc.id).toBe(doc.id);
    expect((await listVersions(cliA, id)).length).toBe(2);
  });
});
