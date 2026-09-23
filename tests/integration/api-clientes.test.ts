import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../setup/db";
import { asUser, callRoute, createTestUsers } from "../setup/session";
import type { SessionUser } from "@/lib/auth/rbac";
import { GET as listGET, POST as listPOST } from "@/app/api/clientes/route";
import {
  GET as oneGET,
  PATCH as onePATCH,
  DELETE as oneDELETE,
} from "@/app/api/clientes/[id]/route";
import { PATCH as statusPATCH } from "@/app/api/clientes/[id]/status/route";
import { POST as contatoPOST } from "@/app/api/clientes/[id]/contatos/route";
import { POST as contratoPOST } from "@/app/api/clientes/[id]/contratos/route";
import { GET as selecaoGET } from "@/app/api/clientes/selecao/route";

describe("API /api/clientes — permissões e validação", () => {
  let users: {
    admin: SessionUser;
    operacional: SessionUser;
    financeiro: SessionUser;
    cliente: SessionUser;
  };
  let clienteAId = "";
  let clienteBId = "";

  beforeAll(async () => {
    await resetDatabase();
    const a = await prisma.client.create({
      data: { code: "AA", legalName: "A Ltda", tradeName: "A", cnpj: "11222333000181" },
    });
    const b = await prisma.client.create({
      data: { code: "BB", legalName: "B Ltda", tradeName: "B", cnpj: "04252011000110" },
    });
    clienteAId = a.id;
    clienteBId = b.id;
    users = await createTestUsers(a.id);
  });

  afterAll(async () => {
    asUser(null);
    await prisma.$disconnect();
  });

  it("sem sessão: 401", async () => {
    asUser(null);
    expect((await callRoute(listGET, { path: "/api/clientes" })).status).toBe(401);
  });

  it("Operacional e Financeiro listam; Cliente recebe 403", async () => {
    asUser(users.operacional);
    const r1 = await callRoute(listGET, { path: "/api/clientes?sort=code" });
    expect(r1.status).toBe(200);
    expect((r1.json as { total: number }).total).toBe(2);
    asUser(users.financeiro);
    expect((await callRoute(listGET, { path: "/api/clientes" })).status).toBe(200);
    asUser(users.cliente);
    expect((await callRoute(listGET, { path: "/api/clientes" })).status).toBe(403);
  });

  it("query inválida: 422 com detalhes", async () => {
    asUser(users.admin);
    const r = await callRoute(listGET, { path: "/api/clientes?sort=hack&page=0" });
    expect(r.status).toBe(422);
    expect((r.json as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");
  });

  it("somente Admin cria; CNPJ inválido é rejeitado no servidor", async () => {
    const body = {
      code: "NOVO",
      legalName: "Novo Cliente S.A.",
      tradeName: "Novo",
      cnpj: "00.000.000/0001-91",
    };
    asUser(users.operacional);
    expect(
      (await callRoute(listPOST, { method: "POST", path: "/api/clientes", body })).status,
    ).toBe(403);
    asUser(users.financeiro);
    expect(
      (await callRoute(listPOST, { method: "POST", path: "/api/clientes", body })).status,
    ).toBe(403);
    asUser(users.admin);
    const invalido = await callRoute(listPOST, {
      method: "POST",
      path: "/api/clientes",
      body: { ...body, cnpj: "00.000.000/0001-92" },
    });
    expect(invalido.status).toBe(422);
    expect(
      (invalido.json as { error: { details: Array<{ path: string; message: string }> } }).error
        .details,
    ).toEqual([{ path: "cnpj", message: "CNPJ inválido." }]);
    const ok = await callRoute(listPOST, { method: "POST", path: "/api/clientes", body });
    expect(ok.status).toBe(201);
    expect((ok.json as { cnpj: string }).cnpj).toBe("00000000000191");
    const dup = await callRoute(listPOST, {
      method: "POST",
      path: "/api/clientes",
      body: { ...body, code: "OUTRO" },
    });
    expect(dup.status).toBe(409);
  });

  it("detalhe, edição, status e exclusão respeitam permissões", async () => {
    asUser(users.operacional);
    expect(
      (await callRoute(oneGET, { path: `/api/clientes/${clienteBId}`, params: { id: clienteBId } }))
        .status,
    ).toBe(200);
    expect(
      (
        await callRoute(statusPATCH, {
          method: "PATCH",
          path: "",
          params: { id: clienteBId },
          body: { isActive: false },
        })
      ).status,
    ).toBe(403);
    asUser(users.admin);
    const upd = await callRoute(onePATCH, {
      method: "PATCH",
      path: "",
      params: { id: clienteBId },
      body: { code: "BB", legalName: "B Ltda", tradeName: "B Editado", cnpj: "04252011000110" },
    });
    expect(upd.status).toBe(200);
    expect((upd.json as { tradeName: string }).tradeName).toBe("B Editado");
    expect(
      (
        await callRoute(statusPATCH, {
          method: "PATCH",
          path: "",
          params: { id: clienteBId },
          body: { isActive: false },
        })
      ).status,
    ).toBe(200);
    expect(
      (await callRoute(oneDELETE, { method: "DELETE", path: "", params: { id: clienteBId } }))
        .status,
    ).toBe(204);
    expect((await callRoute(oneGET, { path: "", params: { id: clienteBId } })).status).toBe(404);
    expect((await callRoute(oneGET, { path: "", params: { id: "nao-e-uuid" } })).status).toBe(422);
  });

  it("Cliente logado não acessa cadastro de outro cliente (404) nem o próprio (403 por papel)", async () => {
    asUser(users.cliente);
    expect((await callRoute(oneGET, { path: "", params: { id: clienteAId } })).status).toBe(403);
    expect((await callRoute(oneGET, { path: "", params: { id: clienteBId } })).status).toBe(403);
  });

  it("contatos e contratos: só Admin; seleção exclui cliente inativo", async () => {
    asUser(users.operacional);
    expect(
      (
        await callRoute(contatoPOST, {
          method: "POST",
          path: "",
          params: { id: clienteAId },
          body: { name: "X", email: "x@x.com" },
        })
      ).status,
    ).toBe(403);
    asUser(users.admin);
    const ct = await callRoute(contatoPOST, {
      method: "POST",
      path: "",
      params: { id: clienteAId },
      body: { name: "Aprovador", email: "ap@a.com", isApprover: true },
    });
    expect(ct.status).toBe(201);
    const cr = await callRoute(contratoPOST, {
      method: "POST",
      path: "",
      params: { id: clienteAId },
      body: { code: "CT-1", name: "Objeto", unit: "Unidade", startDate: "2026-01-01" },
    });
    expect(cr.status).toBe(201);
    const crDup = await callRoute(contratoPOST, {
      method: "POST",
      path: "",
      params: { id: clienteAId },
      body: { code: "ct-1", name: "Objeto", unit: "Unidade", startDate: "2026-01-01" },
    });
    expect(crDup.status).toBe(409);
    const inexistente = await callRoute(contratoPOST, {
      method: "POST",
      path: "",
      params: { id: "0199c000-0000-7000-8000-000000000000" },
      body: { code: "CT-9", name: "Objeto", unit: "Unidade", startDate: "2026-01-01" },
    });
    expect(inexistente.status).toBe(404);

    asUser(users.operacional);
    const sel = await callRoute(selecaoGET, { path: "/api/clientes/selecao" });
    expect(sel.status).toBe(200);
    const codes = (
      sel.json as Array<{ code: string; contacts: unknown[]; contracts: unknown[] }>
    ).map((c) => c.code);
    expect(codes).toEqual(["AA", "NOVO"]); // BB foi inativado/excluído
    asUser(users.financeiro);
    expect((await callRoute(selecaoGET, { path: "/api/clientes/selecao" })).status).toBe(403);
  });
});
