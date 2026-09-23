/**
 * Fase 6: dashboard, relatorios (totais = soma das linhas sob filtros combinados),
 * busca global e exportacoes, sempre respeitando escopo e papel.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import * as XLSX from "xlsx";
import { prisma, resetDatabase } from "../setup/db";
import { asUser, callRoute, createTestUsers } from "../setup/session";
import { CNPJ_A, CNPJ_B, createClientFixture } from "../setup/fixtures";
import { extractPdfText } from "../setup/pdf-text";
import { addItem, createMeasurement } from "@/lib/services/measurement.service";
import {
  assertReportAllowed,
  getClientSummary,
  getDashboard,
  getReport,
  globalSearch,
  listCompetences,
} from "@/lib/services/report.service";
import { createMeasurementSchema, laborItemSchema } from "@/lib/validation/measurement";
import { reportFiltersSchema } from "@/lib/validation/report";
import { getScope } from "@/lib/auth/scope";
import { MeasurementStatus as S } from "@/lib/db/generated/enums";
import { ForbiddenError } from "@/lib/errors";
import type { Scope } from "@/lib/auth/scope";
import * as relatoriosRoute from "@/app/api/relatorios/route";
import * as exportarRoute from "@/app/api/relatorios/exportar/route";
import * as buscaRoute from "@/app/api/busca/route";
import * as dashboardRoute from "@/app/api/dashboard/route";

const ALL: Scope = { kind: "ALL" };
const actor = { label: "teste" };
const soma = (xs: string[]) => xs.reduce((acc, v) => acc.plus(v), new Decimal(0)).toFixed(2);

interface Plano {
  cliente: "A" | "B";
  competence: string;
  status: S;
  valor: string;
  frs?: string;
  pc?: string;
  nf?: string;
}

const PLANO: Plano[] = [
  { cliente: "A", competence: "07/2026", status: S.FATURADO, valor: "1000.10", nf: "NF-0001" },
  { cliente: "A", competence: "08/2026", status: S.APROVADO, valor: "2000.20", frs: "FRS-77" },
  { cliente: "A", competence: "09/2026", status: S.EM_ELABORACAO, valor: "300.30", pc: "PC-4500" },
  { cliente: "A", competence: "09/2026", status: S.CANCELADO, valor: "50.00" },
  { cliente: "B", competence: "08/2026", status: S.FATURADO, valor: "4000.40", nf: "NF-0002" },
  { cliente: "B", competence: "09/2026", status: S.ASSINADO, valor: "500.50", frs: "FRS-99" },
  { cliente: "B", competence: "09/2026", status: S.AGUARDANDO_ENVIO, valor: "60.60" },
];

describe("relatórios, dashboard e busca", () => {
  let users: Awaited<ReturnType<typeof createTestUsers>>;
  let a: Awaited<ReturnType<typeof createClientFixture>>;
  let b: Awaited<ReturnType<typeof createClientFixture>>;
  const ids: string[] = [];

  beforeAll(async () => {
    await resetDatabase();
    a = await createClientFixture("AAA", CNPJ_A);
    b = await createClientFixture("BBB", CNPJ_B);
    users = await createTestUsers(a.client.id);
    for (const p of PLANO) {
      const fx = p.cliente === "A" ? a : b;
      const [mm, yyyy] = p.competence.split("/");
      const m = await createMeasurement(
        users.admin,
        createMeasurementSchema.parse({
          clientId: fx.client.id,
          contractId: fx.contract.id,
          competence: p.competence,
          startDate: `${yyyy}-${mm}-01`,
          endDate: `${yyyy}-${mm}-28`,
          issueDate: `${yyyy}-${mm}-28`,
          frs: p.frs,
          purchaseOrder: p.pc,
        }),
        actor,
      );
      await addItem(
        ALL,
        m.id,
        "mao-de-obra",
        laborItemSchema.parse({
          code: "MO-1",
          role: "Soldador",
          quantity: "1",
          unit: "h",
          unitPrice: p.valor,
        }),
        actor,
      );
      await prisma.measurement.update({ where: { id: m.id }, data: { status: p.status } });
      if (p.nf) {
        await prisma.invoice.create({
          data: {
            measurementId: m.id,
            number: p.nf,
            issueDate: new Date(`${yyyy}-${mm}-28T00:00:00Z`),
            amount: p.status === S.FATURADO && p.cliente === "B" ? "3999.40" : p.valor,
          },
        });
      }
      ids.push(m.id);
    }
  });

  afterAll(async () => {
    asUser(null);
    await prisma.$disconnect();
  });

  const filtros = (raw: Record<string, string>) => reportFiltersSchema.parse(raw);

  it("totais do relatório batem com a soma das linhas sob filtros combinados", async () => {
    const f = filtros({
      tipo: "medicoes",
      de: "08/2026",
      ate: "09/2026",
      clientId: a.client.id,
      statuses: "APROVADO,EM_ELABORACAO,CANCELADO",
    });
    const r = await getReport(ALL, f, { all: true });
    expect(r.rows).toHaveLength(3);
    expect(r.rows.every((x) => x.clientId === a.client.id)).toBe(true);
    expect(r.rows.every((x) => x.competence >= "2026-08" && x.competence <= "2026-09")).toBe(true);
    expect(r.totais.quantidade).toBe(3);
    expect(r.totais.totalAmount).toBe(soma(r.rows.map((x) => x.totalAmount)));
    expect(r.totais.totalAmount).toBe("2350.50");
    // cards (por status) somam o mesmo total das linhas
    expect(soma(r.porStatus.map((s) => s.valor))).toBe(r.totais.totalAmount);
    expect(r.porStatus.reduce((n, s) => n + s.quantidade, 0)).toBe(r.totais.quantidade);
    expect(soma(r.porCliente.map((c) => c.valor))).toBe(r.totais.totalAmount);
    expect(soma(r.porCompetencia.map((c) => c.valor))).toBe(r.totais.totalAmount);
  });

  it("totais consideram o conjunto inteiro, não só a página", async () => {
    const pagina = await getReport(ALL, filtros({ tipo: "medicoes", pageSize: "2", page: "2" }));
    expect(pagina.rows).toHaveLength(2);
    expect(pagina.total).toBe(PLANO.length);
    expect(pagina.totalPages).toBe(4);
    const tudo = await getReport(ALL, filtros({ tipo: "medicoes" }), { all: true });
    expect(pagina.totais.totalAmount).toBe(soma(tudo.rows.map((x) => x.totalAmount)));
  });

  it("relatório financeiro exclui canceladas; faturamento só da liberação em diante, com valor da NF", async () => {
    const fin = await getReport(ALL, filtros({ tipo: "financeiro" }), { all: true });
    expect(fin.rows.some((x) => x.status === S.CANCELADO)).toBe(false);
    expect(fin.rows).toHaveLength(PLANO.length - 1);
    const fat = await getReport(ALL, filtros({ tipo: "faturamento" }), { all: true });
    expect(fat.rows.map((x) => x.status).sort()).toEqual([S.FATURADO, S.FATURADO]);
    expect(fat.totais.invoiceAmount).toBe(soma(["1000.10", "3999.40"]));
    expect(fat.totais.totalAmount).toBe(soma(["1000.10", "4000.40"]));
  });

  it("escopo: cliente A só vê as próprias medições a partir do envio; financeiro só de APROVADO em diante", async () => {
    const cli = await getReport(getScope(users.cliente), filtros({ tipo: "medicoes" }), {
      all: true,
    });
    expect(cli.rows.every((x) => x.clientId === a.client.id)).toBe(true);
    expect(cli.rows.map((x) => x.status).sort()).toEqual([S.APROVADO, S.FATURADO]);
    // pedir explicitamente o cliente B nao vaza nada
    const cliB = await getReport(
      getScope(users.cliente),
      filtros({ tipo: "medicoes", clientId: b.client.id }),
      { all: true },
    );
    expect(cliB.total).toBe(0);
    expect(cliB.totais.totalAmount).toBe("0.00");
    const fin = await getReport(getScope(users.financeiro), filtros({ tipo: "financeiro" }), {
      all: true,
    });
    expect(fin.rows.map((x) => x.status).sort()).toEqual([
      S.APROVADO,
      S.ASSINADO,
      S.FATURADO,
      S.FATURADO,
    ]);
  });

  it("operacional só acessa o relatório de medições", () => {
    expect(() => assertReportAllowed(users.operacional, "medicoes")).not.toThrow();
    expect(() => assertReportAllowed(users.operacional, "financeiro")).toThrow(ForbiddenError);
    expect(() => assertReportAllowed(users.operacional, "faturamento")).toThrow(ForbiddenError);
    expect(() => assertReportAllowed(users.financeiro, "faturamento")).not.toThrow();
  });

  it("dashboard: cards somam por grupo de status e o filtro de competência é respeitado", async () => {
    const d = await getDashboard(ALL);
    expect(d.competences).toEqual(["2026-09", "2026-08", "2026-07"]);
    expect(await listCompetences(ALL)).toEqual(d.competences);
    expect(d.cards.emElaboracao).toEqual({ quantidade: 2, valor: soma(["300.30", "60.60"]) });
    expect(d.cards.aguardandoCliente.quantidade).toBe(0);
    expect(d.cards.aprovadasNaoFaturadas).toEqual({
      quantidade: 2,
      valor: soma(["2000.20", "500.50"]),
    });
    expect(d.cards.faturadas).toEqual({ quantidade: 2, valor: soma(["1000.10", "4000.40"]) });
    expect(d.cards.nfDivergente).toBe(1);
    expect(d.porStatus.reduce((n, s) => n + s.quantidade, 0)).toBe(PLANO.length);
    expect(d.faturadoPorCompetencia).toEqual([
      { competence: "2026-07", valor: "1000.10", quantidade: 1 },
      { competence: "2026-08", valor: "4000.40", quantidade: 1 },
    ]);
    // valor por cliente exclui canceladas
    const porA = d.valorPorCliente.find((c) => c.clientId === a.client.id)!;
    expect(porA.valor).toBe(soma(["1000.10", "2000.20", "300.30"]));
    expect(d.pendencias.map((p) => p.tipo).sort()).toEqual(["AGUARDANDO_ENVIO", "NF_DIVERGENTE"]);
    expect(d.atividade.length).toBeGreaterThan(0);

    const set = await getDashboard(ALL, { competence: "2026-09" });
    expect(set.porStatus.reduce((n, s) => n + s.quantidade, 0)).toBe(4);
    expect(set.cards.faturadas.quantidade).toBe(0);
    expect(set.valorPorCliente.map((c) => c.clientId).sort()).toEqual(
      [a.client.id, b.client.id].sort(),
    );
  });

  it("dashboard do cliente A não contém nada do cliente B", async () => {
    const d = await getDashboard(getScope(users.cliente));
    expect(d.valorPorCliente.map((c) => c.clientId)).toEqual([a.client.id]);
    expect(d.cards.faturadas).toEqual({ quantidade: 1, valor: "1000.10" });
    expect(d.cards.emElaboracao.quantidade).toBe(0);
    expect(d.pendencias).toEqual([]);
    expect(d.atividade.every((x) => x.number?.startsWith("BM-"))).toBe(true);
    const numerosB = new Set(
      (await prisma.measurement.findMany({ where: { clientId: b.client.id } })).map(
        (m) => m.number,
      ),
    );
    expect(d.atividade.some((x) => x.number && numerosB.has(x.number))).toBe(false);
  });

  it("resumo do cliente (visão individual) respeita o escopo", async () => {
    const r = await getClientSummary(ALL, a.client.id);
    expect(r.total).toEqual({ quantidade: 3, valor: soma(["1000.10", "2000.20", "300.30"]) });
    expect(r.faturado).toEqual({ quantidade: 1, valor: "1000.10" });
    expect(r.ultimas).toHaveLength(4);
    const deB = await getClientSummary(getScope(users.cliente), b.client.id);
    expect(deB.total.quantidade).toBe(0);
    expect(deB.ultimas).toEqual([]);
  });

  it("busca global encontra por número, FRS, PC, NF, contrato e cliente — só no escopo", async () => {
    const numero = (await prisma.measurement.findUniqueOrThrow({ where: { id: ids[0]! } })).number;
    const porNumero = await globalSearch(users.admin, ALL, numero);
    expect(porNumero.medicoes.map((m) => m.id)).toEqual([ids[0]]);
    expect(porNumero.medicoes[0]!.match).toBe("Número");

    const porFrs = await globalSearch(users.admin, ALL, "frs-77");
    expect(porFrs.medicoes.map((m) => m.id)).toEqual([ids[1]]);
    expect(porFrs.medicoes[0]!.match).toBe("FRS FRS-77");

    const porPc = await globalSearch(users.admin, ALL, "PC-4500");
    expect(porPc.medicoes.map((m) => m.id)).toEqual([ids[2]]);

    const porNf = await globalSearch(users.admin, ALL, "NF-000");
    expect(porNf.notasFiscais.map((n) => n.number).sort()).toEqual(["NF-0001", "NF-0002"]);

    const porContrato = await globalSearch(users.admin, ALL, "CT-BBB");
    expect(porContrato.contratos.map((c) => c.code)).toEqual(["CT-BBB"]);
    expect(porContrato.medicoes.every((m) => m.match === "Contrato CT-BBB")).toBe(true);
    expect(porContrato.medicoes).toHaveLength(3);

    const porCliente = await globalSearch(users.admin, ALL, "AAA");
    expect(porCliente.clientes.map((c) => c.code)).toEqual(["AAA"]);
    expect(porCliente.medicoes).toHaveLength(4);

    // cliente A: nada de B, nem por FRS, nem por NF, nem por contrato, e sem grupos de cadastro
    const cliScope = getScope(users.cliente);
    const cliFrs = await globalSearch(users.cliente, cliScope, "FRS-99");
    expect(cliFrs.medicoes).toEqual([]);
    const cliNf = await globalSearch(users.cliente, cliScope, "NF-0002");
    expect(cliNf.notasFiscais).toEqual([]);
    const cliCt = await globalSearch(users.cliente, cliScope, "CT-BBB");
    expect(cliCt.contratos).toEqual([]);
    expect(cliCt.clientes).toEqual([]);
    expect(cliCt.medicoes).toEqual([]);
    const cliOk = await globalSearch(users.cliente, cliScope, "NF-0001");
    expect(cliOk.notasFiscais.map((n) => n.number)).toEqual(["NF-0001"]);
  });

  describe("rotas", () => {
    it("GET /api/relatorios: operacional recebe 403 no financeiro e 200 em medições; sem sessão 401", async () => {
      asUser(users.operacional);
      const fin = await callRoute(relatoriosRoute.GET, { path: "/api/relatorios?tipo=financeiro" });
      expect(fin.status).toBe(403);
      const med = await callRoute(relatoriosRoute.GET, { path: "/api/relatorios?tipo=medicoes" });
      expect(med.status).toBe(200);
      expect((med.json as { total: number }).total).toBe(PLANO.length);
      asUser(users.cliente);
      expect((await callRoute(relatoriosRoute.GET, { path: "/api/relatorios" })).status).toBe(403);
      asUser(null);
      expect((await callRoute(relatoriosRoute.GET, { path: "/api/relatorios" })).status).toBe(401);
    });

    it("GET /api/relatorios/exportar gera Excel com todas as linhas e os totais do filtro", async () => {
      asUser(users.financeiro);
      const res = await exportarRoute.GET(
        new Request(
          `http://localhost/api/relatorios/exportar?tipo=financeiro&formato=xlsx&de=08/2026&ate=09/2026&pageSize=1`,
        ),
        { params: Promise.resolve({}) },
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("spreadsheetml");
      expect(res.headers.get("content-disposition")).toMatch(/relatorio-financeiro-.*\.xlsx/);
      const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
      const aba = wb.Sheets[wb.SheetNames[0]!]!;
      const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(aba, { header: 1 });
      const texto = linhas.map((l) => Object.values(l).join("|"));
      // financeiro do Fabio: APROVADO+ e 08..09 => APROVADO (A), FATURADO (B), ASSINADO (B)
      const esperado = await getReport(
        getScope(users.financeiro),
        filtros({ tipo: "financeiro", de: "08/2026", ate: "09/2026" }),
        { all: true },
      );
      expect(esperado.rows).toHaveLength(3);
      for (const r of esperado.rows) expect(texto.some((t) => t.includes(r.number))).toBe(true);
      expect(texto.some((t) => t.startsWith("Total|"))).toBe(true);
    });

    it("GET /api/relatorios/exportar gera PDF com os filtros e os números das medições", async () => {
      asUser(users.admin);
      const res = await exportarRoute.GET(
        new Request(
          `http://localhost/api/relatorios/exportar?tipo=faturamento&formato=pdf&clientId=${b.client.id}`,
        ),
        { params: Promise.resolve({}) },
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf.subarray(0, 4).toString()).toBe("%PDF");
      const { text } = await extractPdfText(buf);
      expect(text).toContain("Relatório de faturamento");
      expect(text).toContain("Filtros: cliente BBB");
      expect(text).toContain("BBB");
      const nB = (
        await prisma.measurement.findFirstOrThrow({
          where: { clientId: b.client.id, status: S.FATURADO },
        })
      ).number;
      expect(text).toContain(nB);
      expect(text).toContain("NF-0002");
    });

    it("operacional não exporta relatório financeiro", async () => {
      asUser(users.operacional);
      const res = await exportarRoute.GET(
        new Request("http://localhost/api/relatorios/exportar?tipo=financeiro&formato=pdf"),
        { params: Promise.resolve({}) },
      );
      expect(res.status).toBe(403);
    });

    it("GET /api/busca exige 2 caracteres e devolve grupos; GET /api/dashboard devolve cards", async () => {
      asUser(users.admin);
      expect((await callRoute(buscaRoute.GET, { path: "/api/busca?q=a" })).status).toBe(422);
      const r = await callRoute(buscaRoute.GET, { path: "/api/busca?q=NF-0001" });
      expect(r.status).toBe(200);
      expect((r.json as { notasFiscais: unknown[] }).notasFiscais).toHaveLength(1);
      const d = await callRoute(dashboardRoute.GET, { path: "/api/dashboard?competence=09/2026" });
      expect(d.status).toBe(200);
      expect(
        (d.json as { cards: { emElaboracao: { quantidade: number } } }).cards.emElaboracao,
      ).toEqual({ quantidade: 2, valor: soma(["300.30", "60.60"]) });
      asUser(null);
      expect((await callRoute(buscaRoute.GET, { path: "/api/busca?q=NF" })).status).toBe(401);
      expect((await callRoute(dashboardRoute.GET, { path: "/api/dashboard" })).status).toBe(401);
    });
  });
});
