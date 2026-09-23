import Decimal from "decimal.js";
import { prisma } from "@/lib/db/prisma";
import { MeasurementStatus as S, Role } from "@/lib/db/generated/enums";
import type { Prisma } from "@/lib/db/generated/client";
import { clientScopeWhere, measurementScopeWhere, type Scope } from "@/lib/auth/scope";
import type { SessionUser } from "@/lib/auth/rbac";
import { ForbiddenError } from "@/lib/errors";
import { can } from "@/lib/auth/rbac";
import type { ReportFilters } from "@/lib/validation/report";
import { ALL_STATUSES, STATUS_LABELS } from "@/lib/services/status-machine";
import { round2 } from "@/lib/services/calculation";
import { dateToDateOnly } from "@/lib/utils/dates";

const sum = (values: Array<Decimal.Value | null | undefined>) =>
  values.reduce<Decimal>((acc, v) => acc.plus(v ?? 0), new Decimal(0));
const money = (v: Decimal.Value | null | undefined) => round2(new Decimal(v ?? 0)).toFixed(2);

// ---------------------------------------------------------------------------
// dashboard
// ---------------------------------------------------------------------------

export interface DashboardData {
  competences: string[];
  porStatus: Array<{ status: S; label: string; quantidade: number; valor: string }>;
  cards: {
    emElaboracao: { quantidade: number; valor: string };
    aguardandoCliente: { quantidade: number; valor: string };
    aprovadasNaoFaturadas: { quantidade: number; valor: string };
    faturadas: { quantidade: number; valor: string };
    correcaoSolicitada: number;
    linksExpirados: number;
    nfDivergente: number;
  };
  faturadoPorCompetencia: Array<{ competence: string; valor: string; quantidade: number }>;
  valorPorCliente: Array<{ clientId: string; cliente: string; valor: string; quantidade: number }>;
  pendencias: Array<{
    id: string;
    number: string;
    cliente: string;
    tipo: "CORRECAO" | "LINK_EXPIRADO" | "NF_DIVERGENTE" | "AGUARDANDO_ENVIO";
    descricao: string;
  }>;
  atividade: Array<{
    id: string;
    action: string;
    actorLabel: string;
    createdAt: Date;
    measurementId: string | null;
    number: string | null;
  }>;
}

const EM_ELABORACAO: S[] = [S.RASCUNHO, S.EM_ELABORACAO, S.AGUARDANDO_ENVIO];
const AGUARDANDO_CLIENTE: S[] = [S.ENVIADO_AO_CLIENTE, S.EM_APROVACAO, S.CORRECAO_SOLICITADA];
const APROVADAS_NAO_FATURADAS: S[] = [S.APROVADO, S.ASSINADO, S.LIBERADO_FATURAMENTO, S.NF_ANEXADA];

export async function getDashboard(
  scope: Scope,
  options: { competence?: string } = {},
): Promise<DashboardData> {
  const base: Prisma.MeasurementWhereInput = {
    AND: [
      measurementScopeWhere(scope),
      options.competence ? { competence: options.competence } : {},
    ],
  };

  const [grouped, competencesRows, faturadoRows, porClienteRows] = await Promise.all([
    prisma.measurement.groupBy({
      by: ["status"],
      where: base,
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
    listCompetences(scope),
    prisma.measurement.groupBy({
      by: ["competence"],
      where: { AND: [measurementScopeWhere(scope), { status: S.FATURADO }] },
      _count: { _all: true },
      _sum: { totalAmount: true },
      orderBy: { competence: "asc" },
    }),
    prisma.measurement.groupBy({
      by: ["clientId"],
      where: { AND: [base, { status: { not: S.CANCELADO } }] },
      _count: { _all: true },
      _sum: { totalAmount: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 8,
    }),
  ]);

  const byStatus = new Map(
    grouped.map((g) => [
      g.status,
      { quantidade: g._count._all, valor: g._sum.totalAmount ?? new Decimal(0) },
    ]),
  );
  const porStatus = ALL_STATUSES.map((status) => ({
    status,
    label: STATUS_LABELS[status],
    quantidade: byStatus.get(status)?.quantidade ?? 0,
    valor: money(byStatus.get(status)?.valor),
  }));
  const card = (statuses: S[]) => ({
    quantidade: statuses.reduce((n, s) => n + (byStatus.get(s)?.quantidade ?? 0), 0),
    valor: money(sum(statuses.map((s) => byStatus.get(s)?.valor))),
  });

  const clientes = await prisma.client.findMany({
    where: { id: { in: porClienteRows.map((r) => r.clientId) } },
    select: { id: true, tradeName: true },
  });
  const clienteNome = new Map(clientes.map((c) => [c.id, c.tradeName]));

  // pendencias
  const now = new Date();
  const [correcoes, aguardandoEnvio, enviadas, invoices] = await Promise.all([
    prisma.measurement.findMany({
      where: { AND: [base, { status: S.CORRECAO_SOLICITADA }] },
      select: { id: true, number: true, client: { select: { tradeName: true } } },
      take: 20,
    }),
    prisma.measurement.findMany({
      where: { AND: [base, { status: S.AGUARDANDO_ENVIO }] },
      select: { id: true, number: true, client: { select: { tradeName: true } } },
      take: 20,
    }),
    prisma.measurement.findMany({
      where: {
        AND: [base, { status: { in: [S.ENVIADO_AO_CLIENTE, S.EM_APROVACAO, S.APROVADO] } }],
      },
      select: {
        id: true,
        number: true,
        client: { select: { tradeName: true } },
        approvalRequests: { orderBy: { sentAt: "desc" }, take: 1, select: { expiresAt: true } },
      },
      take: 50,
    }),
    prisma.invoice.findMany({
      where: { measurement: base },
      select: {
        amount: true,
        number: true,
        measurement: {
          select: {
            id: true,
            number: true,
            totalAmount: true,
            status: true,
            client: { select: { tradeName: true } },
          },
        },
      },
    }),
  ]);
  const pendencias: DashboardData["pendencias"] = [];
  for (const m of correcoes)
    pendencias.push({
      id: m.id,
      number: m.number,
      cliente: m.client.tradeName,
      tipo: "CORRECAO",
      descricao: "Cliente solicitou correção",
    });
  const expiradas = enviadas.filter(
    (m) => m.approvalRequests[0] && m.approvalRequests[0].expiresAt <= now,
  );
  for (const m of expiradas)
    pendencias.push({
      id: m.id,
      number: m.number,
      cliente: m.client.tradeName,
      tipo: "LINK_EXPIRADO",
      descricao: "Link de aprovação expirado sem decisão",
    });
  const divergentes = invoices.filter(
    (i) =>
      i.measurement.status !== S.CANCELADO &&
      !new Decimal(i.amount.toString()).eq(new Decimal(i.measurement.totalAmount.toString())),
  );
  for (const i of divergentes)
    pendencias.push({
      id: i.measurement.id,
      number: i.measurement.number,
      cliente: i.measurement.client.tradeName,
      tipo: "NF_DIVERGENTE",
      descricao: `NF ${i.number} com valor diferente do total da medição`,
    });
  for (const m of aguardandoEnvio)
    pendencias.push({
      id: m.id,
      number: m.number,
      cliente: m.client.tradeName,
      tipo: "AGUARDANDO_ENVIO",
      descricao: "Pronta para envio ao cliente",
    });

  // atividade recente (somente medicoes do escopo)
  const scoped = await prisma.measurement.findMany({
    where: base,
    select: { id: true, number: true },
    take: 500,
  });
  const idSet = new Map(scoped.map((m) => [m.id, m.number]));
  // ultimos eventos: da medicao (entityId) ou de entidades filhas (after.measurementId), filtrados pelo escopo
  const atividadeRaw = scoped.length
    ? await prisma.auditLog.findMany({
        where: {
          OR: [
            { entity: "Measurement", entityId: { in: [...idSet.keys()] } },
            {
              entity: {
                in: [
                  "Invoice",
                  "Signature",
                  "MeasurementVersion",
                  "Document",
                  "LaborItem",
                  "EquipmentItem",
                ],
              },
            },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          action: true,
          actorLabel: true,
          createdAt: true,
          entity: true,
          entityId: true,
          after: true,
          before: true,
        },
      })
    : [];
  const atividade = atividadeRaw
    .map((a) => {
      const payload = (a.after ?? a.before) as { measurementId?: string } | null;
      const mid = a.entity === "Measurement" ? a.entityId : (payload?.measurementId ?? null);
      return {
        id: a.id,
        action: a.action,
        actorLabel: a.actorLabel,
        createdAt: a.createdAt,
        measurementId: mid,
        number: mid ? (idSet.get(mid) ?? null) : null,
      };
    })
    .filter((a) => a.measurementId && idSet.has(a.measurementId))
    .slice(0, 10);

  return {
    competences: competencesRows,
    porStatus,
    cards: {
      emElaboracao: card(EM_ELABORACAO),
      aguardandoCliente: card(AGUARDANDO_CLIENTE),
      aprovadasNaoFaturadas: card(APROVADAS_NAO_FATURADAS),
      faturadas: card([S.FATURADO]),
      correcaoSolicitada: correcoes.length,
      linksExpirados: expiradas.length,
      nfDivergente: divergentes.length,
    },
    faturadoPorCompetencia: faturadoRows.slice(-6).map((r) => ({
      competence: r.competence,
      valor: money(r._sum.totalAmount),
      quantidade: r._count._all,
    })),
    valorPorCliente: porClienteRows.map((r) => ({
      clientId: r.clientId,
      cliente: clienteNome.get(r.clientId) ?? "—",
      valor: money(r._sum.totalAmount),
      quantidade: r._count._all,
    })),
    pendencias,
    atividade,
  };
}

// ---------------------------------------------------------------------------
// relatorios
// ---------------------------------------------------------------------------

export interface ReportRow {
  id: string;
  number: string;
  competence: string;
  issueDate: string;
  client: string;
  clientId: string;
  contract: string;
  frs: string | null;
  purchaseOrder: string | null;
  status: S;
  laborTotal: string;
  equipmentTotal: string;
  totalAmount: string;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  invoiceIssueDate: string | null;
  invoiceAmount: string | null;
  signedAt: string | null;
}

export interface ReportResult {
  rows: ReportRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Totais do conjunto filtrado inteiro (nao so da pagina). */
  totais: {
    quantidade: number;
    laborTotal: string;
    equipmentTotal: string;
    totalAmount: string;
    invoiceAmount: string;
  };
  /** Resumo por status do conjunto filtrado (para os cards). */
  porStatus: Array<{ status: S; label: string; quantidade: number; valor: string }>;
  porCliente: Array<{ clientId: string; cliente: string; quantidade: number; valor: string }>;
  porCompetencia: Array<{ competence: string; quantidade: number; valor: string }>;
}

function reportWhere(scope: Scope, f: ReportFilters): Prisma.MeasurementWhereInput {
  const and: Prisma.MeasurementWhereInput[] = [measurementScopeWhere(scope)];
  if (f.de) and.push({ competence: { gte: f.de } });
  if (f.ate) and.push({ competence: { lte: f.ate } });
  if (f.clientId) and.push({ clientId: f.clientId });
  if (f.statuses?.length) and.push({ status: { in: f.statuses } });
  else if (f.tipo === "faturamento")
    and.push({ status: { in: [S.LIBERADO_FATURAMENTO, S.NF_ANEXADA, S.FATURADO] } });
  else if (f.tipo === "financeiro") and.push({ status: { notIn: [S.CANCELADO] } });
  return { AND: and };
}

/** Papel sem financeiro consolidado (Operacional) so acessa o relatorio de medicoes. */
export function assertReportAllowed(user: SessionUser, tipo: ReportFilters["tipo"]): void {
  if (tipo !== "medicoes" && !can(user, "relatorios:financeiro")) {
    throw new ForbiddenError("Relatório disponível apenas para Administrador e Financeiro.");
  }
}

export async function getReport(
  scope: Scope,
  f: ReportFilters,
  options: { all?: boolean } = {},
): Promise<ReportResult> {
  const where = reportWhere(scope, f);
  const orderBy: Prisma.MeasurementOrderByWithRelationInput[] =
    f.sort === "client"
      ? [{ client: { tradeName: f.order } }, { number: "asc" }]
      : [{ [f.sort]: f.order }, { number: "asc" }];
  const [rowsRaw, total, agg, grouped, byClient, byCompetence, invoiceAgg] = await Promise.all([
    prisma.measurement.findMany({
      where,
      orderBy,
      skip: options.all ? undefined : (f.page - 1) * f.pageSize,
      take: options.all ? 5000 : f.pageSize,
      select: {
        id: true,
        number: true,
        competence: true,
        issueDate: true,
        frs: true,
        purchaseOrder: true,
        status: true,
        laborTotal: true,
        equipmentTotal: true,
        totalAmount: true,
        client: { select: { id: true, tradeName: true } },
        contract: { select: { code: true } },
        invoice: { select: { number: true, status: true, issueDate: true, amount: true } },
        signatures: { orderBy: { signedAt: "desc" }, take: 1, select: { signedAt: true } },
      },
    }),
    prisma.measurement.count({ where }),
    prisma.measurement.aggregate({
      where,
      _sum: { laborTotal: true, equipmentTotal: true, totalAmount: true },
    }),
    prisma.measurement.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
    prisma.measurement.groupBy({
      by: ["clientId"],
      where,
      _count: { _all: true },
      _sum: { totalAmount: true },
      orderBy: { _sum: { totalAmount: "desc" } },
    }),
    prisma.measurement.groupBy({
      by: ["competence"],
      where,
      _count: { _all: true },
      _sum: { totalAmount: true },
      orderBy: { competence: "asc" },
    }),
    prisma.invoice.aggregate({ where: { measurement: where }, _sum: { amount: true } }),
  ]);
  const clientes = await prisma.client.findMany({
    where: { id: { in: byClient.map((r) => r.clientId) } },
    select: { id: true, tradeName: true },
  });
  const nome = new Map(clientes.map((c) => [c.id, c.tradeName]));
  const byStatus = new Map(grouped.map((g) => [g.status, g]));
  return {
    rows: rowsRaw.map((m) => ({
      id: m.id,
      number: m.number,
      competence: m.competence,
      issueDate: dateToDateOnly(m.issueDate),
      client: m.client.tradeName,
      clientId: m.client.id,
      contract: m.contract.code,
      frs: m.frs,
      purchaseOrder: m.purchaseOrder,
      status: m.status,
      laborTotal: money(m.laborTotal.toString()),
      equipmentTotal: money(m.equipmentTotal.toString()),
      totalAmount: money(m.totalAmount.toString()),
      invoiceNumber: m.invoice?.number ?? null,
      invoiceStatus: m.invoice?.status ?? null,
      invoiceIssueDate: m.invoice ? dateToDateOnly(m.invoice.issueDate) : null,
      invoiceAmount: m.invoice ? money(m.invoice.amount.toString()) : null,
      signedAt: m.signatures[0] ? m.signatures[0].signedAt.toISOString() : null,
    })),
    total,
    page: f.page,
    pageSize: f.pageSize,
    totalPages: Math.max(1, Math.ceil(total / f.pageSize)),
    totais: {
      quantidade: total,
      laborTotal: money(agg._sum.laborTotal),
      equipmentTotal: money(agg._sum.equipmentTotal),
      totalAmount: money(agg._sum.totalAmount),
      invoiceAmount: money(invoiceAgg._sum.amount),
    },
    porStatus: ALL_STATUSES.filter((s) => byStatus.has(s)).map((s) => ({
      status: s,
      label: STATUS_LABELS[s],
      quantidade: byStatus.get(s)!._count._all,
      valor: money(byStatus.get(s)!._sum.totalAmount),
    })),
    porCliente: byClient.map((r) => ({
      clientId: r.clientId,
      cliente: nome.get(r.clientId) ?? "—",
      quantidade: r._count._all,
      valor: money(r._sum.totalAmount),
    })),
    porCompetencia: byCompetence.map((r) => ({
      competence: r.competence,
      quantidade: r._count._all,
      valor: money(r._sum.totalAmount),
    })),
  };
}

// ---------------------------------------------------------------------------
// busca global
// ---------------------------------------------------------------------------

export interface SearchResults {
  q: string;
  clientes: Array<{ id: string; code: string; tradeName: string; legalName: string; cnpj: string }>;
  contratos: Array<{ id: string; code: string; name: string; clientId: string; cliente: string }>;
  medicoes: Array<{
    id: string;
    number: string;
    status: S;
    cliente: string;
    competence: string;
    totalAmount: string;
    frs: string | null;
    purchaseOrder: string | null;
    match: string;
  }>;
  notasFiscais: Array<{
    number: string;
    measurementId: string;
    measurementNumber: string;
    cliente: string;
    amount: string;
  }>;
}

export async function globalSearch(
  user: SessionUser,
  scope: Scope,
  q: string,
): Promise<SearchResults> {
  const digits = q.replace(/\D/g, "");
  const contains = (field: string) => ({ [field]: { contains: q, mode: "insensitive" as const } });
  const podeClientes = can(user, "clientes:ver");
  const [clientes, contratos, medicoes, notas] = await Promise.all([
    podeClientes
      ? prisma.client.findMany({
          where: {
            AND: [
              clientScopeWhere(scope),
              {
                OR: [
                  contains("tradeName"),
                  contains("legalName"),
                  contains("code"),
                  ...(digits ? [{ cnpj: { contains: digits } }] : []),
                ],
              },
            ],
          },
          select: { id: true, code: true, tradeName: true, legalName: true, cnpj: true },
          take: 10,
          orderBy: { tradeName: "asc" },
        })
      : Promise.resolve([]),
    podeClientes
      ? prisma.contract.findMany({
          where: {
            AND: [
              { client: clientScopeWhere(scope) },
              { OR: [contains("code"), contains("name"), contains("unit")] },
            ],
          },
          select: {
            id: true,
            code: true,
            name: true,
            clientId: true,
            client: { select: { tradeName: true } },
          },
          take: 10,
          orderBy: { code: "asc" },
        })
      : Promise.resolve([]),
    prisma.measurement.findMany({
      where: {
        AND: [
          measurementScopeWhere(scope),
          {
            OR: [
              contains("number"),
              contains("frs"),
              contains("purchaseOrder"),
              { contract: contains("code") },
              { client: contains("tradeName") },
            ],
          },
        ],
      },
      select: {
        id: true,
        number: true,
        status: true,
        competence: true,
        totalAmount: true,
        frs: true,
        purchaseOrder: true,
        client: { select: { tradeName: true } },
        contract: { select: { code: true } },
      },
      take: 20,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.invoice.findMany({
      where: { AND: [{ measurement: measurementScopeWhere(scope) }, contains("number")] },
      select: {
        number: true,
        amount: true,
        measurement: {
          select: { id: true, number: true, client: { select: { tradeName: true } } },
        },
      },
      take: 10,
    }),
  ]);
  const lower = q.toLowerCase();
  const matchOf = (m: (typeof medicoes)[number]) =>
    m.number.toLowerCase().includes(lower)
      ? "Número"
      : m.frs?.toLowerCase().includes(lower)
        ? `FRS ${m.frs}`
        : m.purchaseOrder?.toLowerCase().includes(lower)
          ? `PC ${m.purchaseOrder}`
          : m.contract.code.toLowerCase().includes(lower)
            ? `Contrato ${m.contract.code}`
            : "Cliente";
  return {
    q,
    clientes,
    contratos: contratos.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      clientId: c.clientId,
      cliente: c.client.tradeName,
    })),
    medicoes: medicoes.map((m) => ({
      id: m.id,
      number: m.number,
      status: m.status,
      cliente: m.client.tradeName,
      competence: m.competence,
      totalAmount: money(m.totalAmount.toString()),
      frs: m.frs,
      purchaseOrder: m.purchaseOrder,
      match: matchOf(m),
    })),
    notasFiscais: notas.map((n) => ({
      number: n.number,
      measurementId: n.measurement.id,
      measurementNumber: n.measurement.number,
      cliente: n.measurement.client.tradeName,
      amount: money(n.amount.toString()),
    })),
  };
}

export function isFinanceiroRole(role: Role): boolean {
  return role === Role.ADMIN || role === Role.FINANCEIRO;
}

// ---------------------------------------------------------------------------
// apoio as telas
// ---------------------------------------------------------------------------

/** Competencias existentes no escopo (mais recente primeiro), para filtros. */
export async function listCompetences(scope: Scope): Promise<string[]> {
  const rows = await prisma.measurement.findMany({
    where: measurementScopeWhere(scope),
    select: { competence: true },
    distinct: ["competence"],
    orderBy: { competence: "desc" },
  });
  return rows.map((r) => r.competence);
}

export interface ClientSummary {
  porStatus: Array<{ status: S; label: string; quantidade: number; valor: string }>;
  total: { quantidade: number; valor: string };
  faturado: { quantidade: number; valor: string };
  ultimas: Array<{
    id: string;
    number: string;
    competence: string;
    status: S;
    totalAmount: string;
    updatedAt: Date;
  }>;
}

/** Visao individual do cliente: medicoes por status e as mais recentes (respeita o escopo). */
export async function getClientSummary(scope: Scope, clientId: string): Promise<ClientSummary> {
  const where: Prisma.MeasurementWhereInput = { AND: [measurementScopeWhere(scope), { clientId }] };
  const [grouped, ultimas] = await Promise.all([
    prisma.measurement.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
    prisma.measurement.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      take: 5,
      select: {
        id: true,
        number: true,
        competence: true,
        status: true,
        totalAmount: true,
        updatedAt: true,
      },
    }),
  ]);
  const byStatus = new Map(grouped.map((g) => [g.status, g]));
  const ativos = grouped.filter((g) => g.status !== S.CANCELADO);
  const faturado = byStatus.get(S.FATURADO);
  return {
    porStatus: ALL_STATUSES.filter((s) => byStatus.has(s)).map((s) => ({
      status: s,
      label: STATUS_LABELS[s],
      quantidade: byStatus.get(s)!._count._all,
      valor: money(byStatus.get(s)!._sum.totalAmount),
    })),
    total: {
      quantidade: ativos.reduce((n, g) => n + g._count._all, 0),
      valor: money(sum(ativos.map((g) => g._sum.totalAmount))),
    },
    faturado: {
      quantidade: faturado?._count._all ?? 0,
      valor: money(faturado?._sum.totalAmount),
    },
    ultimas: ultimas.map((m) => ({
      id: m.id,
      number: m.number,
      competence: m.competence,
      status: m.status,
      totalAmount: money(m.totalAmount.toString()),
      updatedAt: m.updatedAt,
    })),
  };
}
