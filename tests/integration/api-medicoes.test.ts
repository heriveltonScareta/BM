import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../setup/db";
import { asUser, callRoute, createTestUsers } from "../setup/session";
import { CNPJ_A, CNPJ_B, createClientFixture } from "../setup/fixtures";
import type { SessionUser } from "@/lib/auth/rbac";
import { GET as listGET, POST as listPOST } from "@/app/api/medicoes/route";
import { GET as oneGET, PATCH as onePATCH } from "@/app/api/medicoes/[id]/route";
import { POST as statusPOST } from "@/app/api/medicoes/[id]/status/route";
import { GET as timelineGET } from "@/app/api/medicoes/[id]/timeline/route";
import {
  POST as itemPOST,
  PATCH as reorderPATCH,
} from "@/app/api/medicoes/[id]/itens/[tipo]/route";
import {
  PATCH as itemPATCH,
  DELETE as itemDELETE,
} from "@/app/api/medicoes/[id]/itens/[tipo]/[itemId]/route";
import { POST as dupPOST } from "@/app/api/medicoes/[id]/itens/[tipo]/[itemId]/duplicar/route";
import { MeasurementStatus as S } from "@/lib/db/generated/enums";

describe("API /api/medicoes — permissões, transições e isolamento", () => {
  let users: {
    admin: SessionUser;
    operacional: SessionUser;
    financeiro: SessionUser;
    cliente: SessionUser;
  };
  let a: Awaited<ReturnType<typeof createClientFixture>>;
  let b: Awaited<ReturnType<typeof createClientFixture>>;
  let idA = "";
  let idB = "";
  let itemId = "";

  beforeAll(async () => {
    await resetDatabase();
    a = await createClientFixture("AAA", CNPJ_A);
    b = await createClientFixture("BBB", CNPJ_B);
    users = await createTestUsers(a.client.id);
  });

  afterAll(async () => {
    asUser(null);
    await prisma.$disconnect();
  });

  const body = (clientId: string, contractId: string) => ({
    clientId,
    contractId,
    competence: "04/2026",
    startDate: "2026-04-01",
    endDate: "2026-04-30",
    issueDate: "2026-04-30",
  });

  it("financeiro e cliente não criam (403); operacional cria (201)", async () => {
    asUser(users.financeiro);
    expect(
      (
        await callRoute(listPOST, {
          method: "POST",
          path: "/api/medicoes",
          body: body(a.client.id, a.contract.id),
        })
      ).status,
    ).toBe(403);
    asUser(users.cliente);
    expect(
      (
        await callRoute(listPOST, {
          method: "POST",
          path: "/api/medicoes",
          body: body(a.client.id, a.contract.id),
        })
      ).status,
    ).toBe(403);
    asUser(users.operacional);
    const r = await callRoute(listPOST, {
      method: "POST",
      path: "/api/medicoes",
      body: body(a.client.id, a.contract.id),
    });
    expect(r.status).toBe(201);
    idA = (r.json as { id: string }).id;
    const rb = await callRoute(listPOST, {
      method: "POST",
      path: "/api/medicoes",
      body: body(b.client.id, b.contract.id),
    });
    idB = (rb.json as { id: string }).id;
    const invalid = await callRoute(listPOST, {
      method: "POST",
      path: "/api/medicoes",
      body: { ...body(a.client.id, a.contract.id), competence: "13/2026" },
    });
    expect(invalid.status).toBe(422);
    expect(
      (invalid.json as { error: { details: Array<{ path: string }> } }).error.details.map(
        (d) => d.path,
      ),
    ).toEqual(["competence"]);
    const invalidDates = await callRoute(listPOST, {
      method: "POST",
      path: "/api/medicoes",
      body: { ...body(a.client.id, a.contract.id), endDate: "2026-03-01" },
    });
    expect(invalidDates.status).toBe(422);
    expect(
      (invalidDates.json as { error: { details: Array<{ path: string }> } }).error.details.map(
        (d) => d.path,
      ),
    ).toEqual(["endDate"]);
  });

  it("itens: operacional adiciona/edita/duplica/exclui; financeiro não; resposta traz totais", async () => {
    asUser(users.operacional);
    const add = await callRoute(itemPOST, {
      method: "POST",
      path: "",
      params: { id: idA, tipo: "mao-de-obra" },
      body: { code: "MO-1", role: "Blaster", quantity: "2", unit: "h", unitPrice: "55" },
    });
    expect(add.status).toBe(201);
    const added = add.json as {
      item: { id: string; totalPrice: string };
      totals: { totalAmount: string };
    };
    itemId = added.item.id;
    expect(added.item.totalPrice).toBe("110.00");
    expect(added.totals.totalAmount).toBe("110.00");

    const upd = await callRoute(itemPATCH, {
      method: "PATCH",
      path: "",
      params: { id: idA, tipo: "mao-de-obra", itemId },
      body: { code: "MO-1", role: "Blaster", quantity: "3", unit: "h", unitPrice: "55" },
    });
    expect(upd.status).toBe(200);
    expect((upd.json as { totals: { totalAmount: string } }).totals.totalAmount).toBe("165.00");

    const dup = await callRoute(dupPOST, {
      method: "POST",
      path: "",
      params: { id: idA, tipo: "mao-de-obra", itemId },
    });
    expect(dup.status).toBe(201);
    const dupId = (dup.json as { item: { id: string } }).item.id;
    const reorder = await callRoute(reorderPATCH, {
      method: "PATCH",
      path: "",
      params: { id: idA, tipo: "mao-de-obra" },
      body: { ids: [dupId, itemId] },
    });
    expect(reorder.status).toBe(200);
    const del = await callRoute(itemDELETE, {
      method: "DELETE",
      path: "",
      params: { id: idA, tipo: "mao-de-obra", itemId: dupId },
    });
    expect(del.status).toBe(200);
    expect((del.json as { totals: { totalAmount: string } }).totals.totalAmount).toBe("165.00");

    expect(
      (
        await callRoute(itemPOST, {
          method: "POST",
          path: "",
          params: { id: idA, tipo: "outro" },
          body: {},
        })
      ).status,
    ).toBe(422);
    asUser(users.financeiro);
    expect(
      (
        await callRoute(itemPOST, {
          method: "POST",
          path: "",
          params: { id: idA, tipo: "mao-de-obra" },
          body: { code: "X", role: "X", quantity: "1", unit: "h", unitPrice: "1" },
        })
      ).status,
    ).toBe(403);
  });

  it("transições pela API respeitam a máquina de estados e o papel", async () => {
    asUser(users.operacional);
    expect(
      (
        await callRoute(statusPOST, {
          method: "POST",
          path: "",
          params: { id: idA },
          body: { to: S.FATURADO },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await callRoute(statusPOST, {
          method: "POST",
          path: "",
          params: { id: idA },
          body: { to: "INVENTADO" },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await callRoute(statusPOST, {
          method: "POST",
          path: "",
          params: { id: idA },
          body: { to: S.EM_ELABORACAO },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await callRoute(statusPOST, {
          method: "POST",
          path: "",
          params: { id: idA },
          body: { to: S.CANCELADO, reason: "x" },
        })
      ).status,
    ).toBe(409);
    asUser(users.financeiro);
    expect(
      (
        await callRoute(statusPOST, {
          method: "POST",
          path: "",
          params: { id: idA },
          body: { to: S.AGUARDANDO_ENVIO },
        })
      ).status,
    ).toBe(404); // fora do escopo do financeiro
    asUser(users.admin);
    expect(
      (
        await callRoute(statusPOST, {
          method: "POST",
          path: "",
          params: { id: idA },
          body: { to: S.AGUARDANDO_ENVIO },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await callRoute(onePATCH, {
          method: "PATCH",
          path: "",
          params: { id: idA },
          body: {
            contractId: a.contract.id,
            competence: "04/2026",
            startDate: "2026-04-01",
            endDate: "2026-04-30",
            issueDate: "2026-04-30",
            frs: "FRS-9",
          },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await callRoute(statusPOST, {
          method: "POST",
          path: "",
          params: { id: idA },
          body: { to: S.ENVIADO_AO_CLIENTE },
        })
      ).status,
    ).toBe(409);
  });

  it("isolamento: cliente A não vê nada de B nem medições de A antes do envio; financeiro só de APROVADO", async () => {
    asUser(users.cliente);
    expect((await callRoute(oneGET, { path: "", params: { id: idB } })).status).toBe(404);
    expect((await callRoute(oneGET, { path: "", params: { id: idA } })).status).toBe(404);
    expect((await callRoute(timelineGET, { path: "", params: { id: idB } })).status).toBe(404);
    expect(
      (
        await callRoute(itemPOST, {
          method: "POST",
          path: "",
          params: { id: idB, tipo: "mao-de-obra" },
          body: { code: "X", role: "X", quantity: "1", unit: "h", unitPrice: "1" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await callRoute(statusPOST, {
          method: "POST",
          path: "",
          params: { id: idB },
          body: { to: S.EM_ELABORACAO },
        })
      ).status,
    ).toBe(404);
    expect(
      ((await callRoute(listGET, { path: "/api/medicoes" })).json as { total: number }).total,
    ).toBe(0);

    await prisma.measurement.update({ where: { id: idA }, data: { status: S.APROVADO } });
    await prisma.measurement.update({ where: { id: idB }, data: { status: S.APROVADO } });
    const list = await callRoute(listGET, { path: "/api/medicoes" });
    expect(
      (list.json as { total: number; items: Array<{ id: string }> }).items.map((m) => m.id),
    ).toEqual([idA]);
    expect((await callRoute(oneGET, { path: "", params: { id: idA } })).status).toBe(200);
    expect((await callRoute(oneGET, { path: "", params: { id: idB } })).status).toBe(404);

    asUser(users.financeiro);
    expect(
      ((await callRoute(listGET, { path: "/api/medicoes" })).json as { total: number }).total,
    ).toBe(2);
    await prisma.measurement.update({ where: { id: idB }, data: { status: S.EM_ELABORACAO } });
    expect(
      ((await callRoute(listGET, { path: "/api/medicoes" })).json as { total: number }).total,
    ).toBe(1);
    expect((await callRoute(oneGET, { path: "", params: { id: idB } })).status).toBe(404);
  });
});
