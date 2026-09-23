/**
 * Teste dedicado de isolamento por cliente (Secao 7, item 3): um usuario do Cliente A
 * tenta acessar, por ID direto, recursos do Cliente B em TODAS as rotas de API.
 * Esperado: 404 (nunca 403, para nao revelar existencia) ou 403 quando o papel CLIENTE
 * nem sequer tem a acao (rotas de gestao). Nunca 200.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../setup/db";
import { asUser, callRoute, createTestUsers } from "../setup/session";
import { CNPJ_A, CNPJ_B, createClientFixture } from "../setup/fixtures";
import type { SessionUser } from "@/lib/auth/rbac";
import { addItem, createMeasurement } from "@/lib/services/measurement.service";
import { sendToClient, decidePortal, signPortal } from "@/lib/services/approval.service";
import { createMeasurementSchema, laborItemSchema } from "@/lib/validation/measurement";
import { setEmailProviderForTests, type EmailMessage } from "@/lib/email";
import { MeasurementStatus as S } from "@/lib/db/generated/enums";

import * as medicaoRoute from "@/app/api/medicoes/[id]/route";
import * as statusRoute from "@/app/api/medicoes/[id]/status/route";
import * as timelineRoute from "@/app/api/medicoes/[id]/timeline/route";
import * as itensRoute from "@/app/api/medicoes/[id]/itens/[tipo]/route";
import * as itemRoute from "@/app/api/medicoes/[id]/itens/[tipo]/[itemId]/route";
import * as dupRoute from "@/app/api/medicoes/[id]/itens/[tipo]/[itemId]/duplicar/route";
import * as importarRoute from "@/app/api/medicoes/[id]/importar/route";
import * as exportarRoute from "@/app/api/medicoes/[id]/exportar/route";
import * as pdfRoute from "@/app/api/medicoes/[id]/pdf/route";
import * as enviarRoute from "@/app/api/medicoes/[id]/enviar/route";
import * as reenviarRoute from "@/app/api/medicoes/[id]/reenviar/route";
import * as versoesRoute from "@/app/api/medicoes/[id]/versoes/route";
import * as versaoPdfRoute from "@/app/api/medicoes/[id]/versoes/[versao]/pdf/route";
import * as compararRoute from "@/app/api/medicoes/[id]/versoes/comparar/route";
import * as aprovacaoRoute from "@/app/api/medicoes/[id]/aprovacao/route";
import * as documentoRoute from "@/app/api/documentos/[id]/download/route";
import * as clienteRoute from "@/app/api/clientes/[id]/route";
import * as clienteStatusRoute from "@/app/api/clientes/[id]/status/route";
import * as contatosRoute from "@/app/api/clientes/[id]/contatos/route";
import * as contratosRoute from "@/app/api/clientes/[id]/contratos/route";
import * as listaMedicoes from "@/app/api/medicoes/route";
import * as liberarRoute from "@/app/api/medicoes/[id]/liberar/route";
import * as notaFiscalRoute from "@/app/api/medicoes/[id]/nota-fiscal/route";
import * as faturarRoute from "@/app/api/medicoes/[id]/faturar/route";
import * as docsMedicaoRoute from "@/app/api/medicoes/[id]/documentos/route";
import * as docRemoveRoute from "@/app/api/documentos/[id]/route";
import * as docsListaRoute from "@/app/api/documentos/route";
import * as relatoriosRoute from "@/app/api/relatorios/route";
import * as exportarRelRoute from "@/app/api/relatorios/exportar/route";
import * as buscaRoute from "@/app/api/busca/route";
import * as dashboardRoute from "@/app/api/dashboard/route";

type Handler = (
  req: Request,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response>;

describe("isolamento por cliente — Cliente A × recursos do Cliente B", () => {
  let clienteA: SessionUser;
  let a: Awaited<ReturnType<typeof createClientFixture>>;
  let b: Awaited<ReturnType<typeof createClientFixture>>;
  let medB = "";
  let itemB = "";
  let docB = "";
  let medA = "";

  beforeAll(async () => {
    await resetDatabase();
    const sent: EmailMessage[] = [];
    setEmailProviderForTests({
      name: "fake",
      async send(m) {
        sent.push(m);
        return { id: "1" };
      },
    });
    a = await createClientFixture("AAA", CNPJ_A);
    b = await createClientFixture("BBB", CNPJ_B);
    const users = await createTestUsers(a.client.id);
    clienteA = users.cliente;
    const actor = { label: "seed" };
    // medicao de B enviada, aprovada e assinada (com versao, documentos e assinatura)
    const mB = await createMeasurement(
      users.admin,
      createMeasurementSchema.parse({
        clientId: b.client.id,
        contractId: b.contract.id,
        competence: "09/2026",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        issueDate: "2026-09-30",
      }),
      actor,
    );
    medB = mB.id;
    itemB = (
      await addItem(
        { kind: "ALL" },
        medB,
        "mao-de-obra",
        laborItemSchema.parse({ code: "X", role: "X", quantity: "1", unit: "h", unitPrice: "1" }),
        actor,
      )
    ).item.id;
    await prisma.measurement.update({ where: { id: medB }, data: { status: S.AGUARDANDO_ENVIO } });
    await sendToClient(users.admin, { kind: "ALL" }, medB, {}, actor);
    const token = sent[0]!.text.match(/\/portal\/aprovacao\/([A-Za-z0-9_-]+)/)![1]!;
    await decidePortal(token, "APROVAR", "", {});
    await signPortal(token, { signerName: "B" }, {});
    docB = (
      await prisma.document.findFirstOrThrow({
        where: { measurementId: medB, type: "BOLETIM_ASSINADO" },
      })
    ).id;
    // medicao de A visivel ao cliente A (para provar que o mesmo usuario enxerga o proprio)
    const mA = await createMeasurement(
      users.admin,
      createMeasurementSchema.parse({
        clientId: a.client.id,
        contractId: a.contract.id,
        competence: "09/2026",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        issueDate: "2026-09-30",
      }),
      actor,
    );
    medA = mA.id;
    await prisma.measurement.update({ where: { id: medA }, data: { status: S.APROVADO } });
    asUser(clienteA);
  });

  afterAll(async () => {
    asUser(null);
    setEmailProviderForTests(undefined);
    await prisma.$disconnect();
  });

  const casos = (): Array<{
    nome: string;
    handler: Handler;
    method?: string;
    params: Record<string, string>;
    body?: unknown;
    esperado: number[];
  }> => [
    { nome: "GET medição", handler: medicaoRoute.GET, params: { id: medB }, esperado: [404] },
    {
      nome: "PATCH medição",
      handler: medicaoRoute.PATCH,
      method: "PATCH",
      params: { id: medB },
      body: {},
      esperado: [403],
    },
    {
      nome: "POST status",
      handler: statusRoute.POST,
      method: "POST",
      params: { id: medB },
      body: { to: "EM_ELABORACAO" },
      esperado: [404],
    },
    { nome: "GET timeline", handler: timelineRoute.GET, params: { id: medB }, esperado: [404] },
    {
      nome: "POST item",
      handler: itensRoute.POST,
      method: "POST",
      params: { id: medB, tipo: "mao-de-obra" },
      body: {},
      esperado: [403],
    },
    {
      nome: "PATCH reordenar",
      handler: itensRoute.PATCH,
      method: "PATCH",
      params: { id: medB, tipo: "mao-de-obra" },
      body: { ids: [itemB] },
      esperado: [403],
    },
    {
      nome: "PATCH item",
      handler: itemRoute.PATCH,
      method: "PATCH",
      params: { id: medB, tipo: "mao-de-obra", itemId: itemB },
      body: {},
      esperado: [403],
    },
    {
      nome: "DELETE item",
      handler: itemRoute.DELETE,
      method: "DELETE",
      params: { id: medB, tipo: "mao-de-obra", itemId: itemB },
      esperado: [403],
    },
    {
      nome: "POST duplicar",
      handler: dupRoute.POST,
      method: "POST",
      params: { id: medB, tipo: "mao-de-obra", itemId: itemB },
      esperado: [403],
    },
    {
      nome: "POST importar",
      handler: importarRoute.POST,
      method: "POST",
      params: { id: medB },
      esperado: [403],
    },
    { nome: "GET exportar", handler: exportarRoute.GET, params: { id: medB }, esperado: [404] },
    { nome: "GET pdf", handler: pdfRoute.GET, params: { id: medB }, esperado: [404] },
    {
      nome: "POST enviar",
      handler: enviarRoute.POST,
      method: "POST",
      params: { id: medB },
      esperado: [403],
    },
    {
      nome: "POST reenviar",
      handler: reenviarRoute.POST,
      method: "POST",
      params: { id: medB },
      esperado: [403],
    },
    { nome: "GET versões", handler: versoesRoute.GET, params: { id: medB }, esperado: [404] },
    {
      nome: "GET versão pdf",
      handler: versaoPdfRoute.GET,
      params: { id: medB, versao: "1" },
      esperado: [404],
    },
    {
      nome: "GET comparar",
      handler: compararRoute.GET,
      params: { id: medB },
      esperado: [404, 422],
    },
    { nome: "GET aprovação", handler: aprovacaoRoute.GET, params: { id: medB }, esperado: [404] },
    {
      nome: "GET documento download",
      handler: documentoRoute.GET,
      params: { id: docB },
      esperado: [404],
    },
    {
      nome: "GET cliente",
      handler: clienteRoute.GET,
      params: { id: b.client.id },
      esperado: [403],
    },
    {
      nome: "PATCH cliente",
      handler: clienteRoute.PATCH,
      method: "PATCH",
      params: { id: b.client.id },
      body: {},
      esperado: [403],
    },
    {
      nome: "DELETE cliente",
      handler: clienteRoute.DELETE,
      method: "DELETE",
      params: { id: b.client.id },
      esperado: [403],
    },
    {
      nome: "PATCH cliente status",
      handler: clienteStatusRoute.PATCH,
      method: "PATCH",
      params: { id: b.client.id },
      body: { isActive: false },
      esperado: [403],
    },
    {
      nome: "POST contato",
      handler: contatosRoute.POST,
      method: "POST",
      params: { id: b.client.id },
      body: {},
      esperado: [403],
    },
    {
      nome: "POST contrato",
      handler: contratosRoute.POST,
      method: "POST",
      params: { id: b.client.id },
      body: {},
      esperado: [403],
    },
    {
      nome: "POST liberar",
      handler: liberarRoute.POST,
      method: "POST",
      params: { id: medB },
      esperado: [403],
    },
    {
      nome: "GET nota fiscal",
      handler: notaFiscalRoute.GET,
      params: { id: medB },
      esperado: [404],
    },
    {
      nome: "POST nota fiscal",
      handler: notaFiscalRoute.POST,
      method: "POST",
      params: { id: medB },
      esperado: [403],
    },
    {
      nome: "PATCH nota fiscal",
      handler: notaFiscalRoute.PATCH,
      method: "PATCH",
      params: { id: medB },
      body: { status: "PAGA" },
      esperado: [403],
    },
    {
      nome: "POST faturar",
      handler: faturarRoute.POST,
      method: "POST",
      params: { id: medB },
      esperado: [403],
    },
    {
      nome: "GET documentos da medição",
      handler: docsMedicaoRoute.GET,
      params: { id: medB },
      esperado: [404],
    },
    {
      nome: "POST documento da medição",
      handler: docsMedicaoRoute.POST,
      method: "POST",
      params: { id: medB },
      esperado: [403],
    },
    {
      nome: "DELETE documento",
      handler: docRemoveRoute.DELETE,
      method: "DELETE",
      params: { id: docB },
      esperado: [403],
    },
  ];

  it("nenhuma rota devolve 200 para recursos do Cliente B", async () => {
    const falhas: string[] = [];
    for (const c of casos()) {
      const path = c.nome === "GET comparar" ? "/x?a=1&b=1" : "/x";
      const r = await callRoute(c.handler, {
        method: c.method,
        path,
        params: c.params,
        body: c.body,
      });
      if (!c.esperado.includes(r.status))
        falhas.push(`${c.nome}: esperado ${c.esperado.join("/")}, obtido ${r.status}`);
    }
    expect(falhas).toEqual([]);
  });

  it("listagens não vazam registros de B; o próprio registro de A continua acessível", async () => {
    const lista = await callRoute(listaMedicoes.GET, { path: "/api/medicoes" });
    expect((lista.json as { items: Array<{ id: string }> }).items.map((m) => m.id)).toEqual([medA]);
    expect((await callRoute(medicaoRoute.GET, { path: "/x", params: { id: medA } })).status).toBe(
      200,
    );
    expect((await callRoute(versoesRoute.GET, { path: "/x", params: { id: medA } })).status).toBe(
      200,
    );
    // busca textual pelo numero da medicao de B nao encontra nada
    const numB = (await prisma.measurement.findUniqueOrThrow({ where: { id: medB } })).number;
    const busca = await callRoute(listaMedicoes.GET, { path: `/api/medicoes?q=${numB}` });
    expect((busca.json as { total: number }).total).toBe(0);
    // listagem de documentos: nada de B, mesmo filtrando pelo clientId de B
    const docs = await callRoute(docsListaRoute.GET, {
      path: `/api/documentos?clientId=${b.client.id}`,
    });
    expect((docs.json as { total: number }).total).toBe(0);
  });

  it("relatórios, busca e dashboard (Fase 6) não vazam registros de B", async () => {
    const numB = (await prisma.measurement.findUniqueOrThrow({ where: { id: medB } })).number;
    // relatorios: CLIENTE nao tem a acao (403); mesmo para quem tem, o clientId de B nao vaza
    expect(
      (await callRoute(relatoriosRoute.GET, { path: `/api/relatorios?clientId=${b.client.id}` }))
        .status,
    ).toBe(403);
    expect(
      (
        await callRoute(exportarRelRoute.GET, {
          path: `/api/relatorios/exportar?clientId=${b.client.id}`,
        })
      ).status,
    ).toBe(403);
    const busca = await callRoute(buscaRoute.GET, { path: `/api/busca?q=${numB}` });
    expect(busca.status).toBe(200);
    expect(busca.json).toMatchObject({
      medicoes: [],
      clientes: [],
      contratos: [],
      notasFiscais: [],
    });
    const buscaB = await callRoute(buscaRoute.GET, { path: `/api/busca?q=BBB` });
    expect(buscaB.json).toMatchObject({ medicoes: [], clientes: [], contratos: [] });
    const dash = await callRoute(dashboardRoute.GET, { path: "/api/dashboard" });
    expect(dash.status).toBe(200);
    const d = dash.json as {
      valorPorCliente: Array<{ clientId: string }>;
      pendencias: Array<{ id: string }>;
      atividade: Array<{ measurementId: string | null }>;
      porStatus: Array<{ quantidade: number }>;
    };
    expect(d.valorPorCliente.map((c) => c.clientId)).toEqual([a.client.id]);
    expect(d.pendencias.some((p) => p.id === medB)).toBe(false);
    expect(d.atividade.some((x) => x.measurementId === medB)).toBe(false);
    expect(d.porStatus.reduce((n, s) => n + s.quantidade, 0)).toBe(1);
  });

  it("financeiro e cliente não acessam rotas administrativas de envio; portal rejeita token malformado", async () => {
    const { POST } = await import("@/app/api/portal/[token]/decidir/route");
    const r = await POST(
      new Request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ decision: "APROVAR" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ token: "curto" }) },
    );
    expect(r.status).toBe(422);
    const r2 = await POST(
      new Request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ decision: "APROVAR" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ token: "z".repeat(43) }) },
    );
    expect(r2.status).toBe(404);
  });
});
