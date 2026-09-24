import Decimal from "decimal.js";
import { prisma, type Db, type Tx } from "@/lib/db/prisma";
import { MeasurementStatus, Role } from "@/lib/db/generated/enums";
import type { Scope } from "@/lib/auth/scope";
import type { SessionUser } from "@/lib/auth/rbac";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TransitionError,
  ValidationError,
} from "@/lib/errors";
import {
  audit,
  type AuditActor,
  type AuditEntity,
  type AuditAction,
} from "@/lib/services/audit.service";
import {
  computeItemTotal,
  computeTotals,
  round2,
  totalsToStrings,
} from "@/lib/services/calculation";
import { nextMeasurementNumber } from "@/lib/services/measurement-number";
import {
  assertTransition,
  isEditable,
  STATUS_LABELS,
  type TransitionGuard,
} from "@/lib/services/status-machine";
import {
  findItemsForTotals,
  findMeasurementBasic,
  findMeasurementById,
  listMeasurementAudit,
  listMeasurements,
} from "@/lib/db/repositories/measurement.repository";
import type {
  CreateMeasurementData,
  EquipmentItemData,
  ItemKind,
  LaborItemData,
  MeasurementHeaderData,
  MeasurementListQuery,
} from "@/lib/validation/measurement";
import { dateOnlyToUtc, yearInTimezone } from "@/lib/utils/dates";
import type { Paginated } from "@/lib/validation/common";

export type {
  MeasurementDetail,
  MeasurementListRow,
} from "@/lib/db/repositories/measurement.repository";

// ---------------------------------------------------------------------------
// leitura
// ---------------------------------------------------------------------------

export async function getMeasurements(scope: Scope, query: MeasurementListQuery) {
  const { items, total } = await listMeasurements(prisma, scope, query);
  const result: Paginated<(typeof items)[number]> = {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
  return result;
}

export async function getMeasurement(scope: Scope, id: string) {
  const m = await findMeasurementById(prisma, scope, id);
  if (!m) throw new NotFoundError("Medição não encontrada.");
  return m;
}

export interface TimelineOptions {
  /** Auditoria completa (IP, id do ator, before/after integrais): so `auditoria:ver`. */
  full?: boolean;
  /** Oculta o e-mail dos usuarios internos no rotulo do ator (perfil CLIENTE). */
  hideActorEmail?: boolean;
}

/** Chaves de before/after visiveis fora da auditoria completa (o que a timeline exibe). */
const PUBLIC_AUDIT_KEYS = new Set([
  "status",
  "motivo",
  "version",
  "number",
  "code",
  "role",
  "name",
  "quantity",
  "unitPrice",
  "totalPrice",
  "totalAmount",
  "nf",
  "series",
  "amount",
  "issueDate",
  "divergencia",
  "ordem",
  "tipo",
  "fileName",
  "type",
  "duplicadoDe",
  "reenvio",
  "signerName",
  "signerEmail",
  "measurementId",
]);

function pickPublic(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload as Record<string, unknown>))
    if (PUBLIC_AUDIT_KEYS.has(k)) out[k] = v;
  return out;
}

/** "Nome <email>" -> "Nome" */
export function actorLabelWithoutEmail(label: string): string {
  return label.replace(/\s*<[^>]*>\s*$/, "");
}

export async function getMeasurementTimeline(
  scope: Scope,
  id: string,
  options: TimelineOptions = {},
) {
  const m = await findMeasurementBasic(prisma, scope, id);
  if (!m) throw new NotFoundError("Medição não encontrada.");
  return timelineFor(id, options);
}

/** Variante para quem ja verificou o escopo da medicao. */
export async function timelineFor(id: string, options: TimelineOptions = {}) {
  const entries = await listMeasurementAudit(prisma, id);
  if (options.full) return entries;
  // fora da auditoria completa: sem IP, sem id do ator e so os campos que a timeline mostra
  return entries.map((e) => ({
    ...e,
    ip: null,
    actorUserId: null,
    actorLabel: options.hideActorEmail ? actorLabelWithoutEmail(e.actorLabel) : e.actorLabel,
    before: pickPublic(e.before),
    after: pickPublic(e.after),
  }));
}

/** Totais persistidos da medicao (para responder as operacoes de item). */
export interface MeasurementTotals {
  laborTotal: string;
  equipmentTotal: string;
  otherAmount: string;
  subtotal: string;
  discountAmount: string;
  additionAmount: string;
  taxAmount: string;
  totalAmount: string;
}

// ---------------------------------------------------------------------------
// helpers internos
// ---------------------------------------------------------------------------

async function requireMeasurement(scope: Scope, id: string) {
  const m = await findMeasurementBasic(prisma, scope, id);
  if (!m) throw new NotFoundError("Medição não encontrada.");
  return m;
}

function assertEditable(status: MeasurementStatus) {
  if (!isEditable(status)) {
    throw new AppError(
      `A medição está em "${STATUS_LABELS[status]}" e não pode ser alterada. Para corrigir, solicite uma nova versão.`,
      409,
      "MEASUREMENT_LOCKED",
    );
  }
}

/** Recalcula e persiste os totais (fonte da verdade). Sempre dentro da transacao da mutacao. */
export async function recalculateTotals(tx: Tx, measurementId: string): Promise<MeasurementTotals> {
  const m = await findItemsForTotals(tx, measurementId);
  const totals = totalsToStrings(
    computeTotals({
      laborItems: m.laborItems.map((i) => ({ totalPrice: i.totalPrice.toString() })),
      equipmentItems: m.equipmentItems.map((i) => ({ totalPrice: i.totalPrice.toString() })),
      otherAmount: m.otherAmount.toString(),
      discountAmount: m.discountAmount.toString(),
      additionAmount: m.additionAmount.toString(),
      taxAmount: m.taxAmount.toString(),
    }),
  );
  await tx.measurement.update({
    where: { id: measurementId },
    data: {
      laborTotal: totals.laborTotal,
      equipmentTotal: totals.equipmentTotal,
      subtotal: totals.subtotal,
      totalAmount: totals.totalAmount,
    },
  });
  return totals;
}

async function validateContract(clientId: string, contractId: string) {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, clientId },
    include: { client: { select: { isActive: true, deletedAt: true } } },
  });
  if (!contract)
    throw new ValidationError("Contrato inválido para o cliente.", [
      { path: "contractId", message: "Contrato inválido para o cliente." },
    ]);
  if (!contract.isActive)
    throw new ValidationError("Contrato inativo.", [
      { path: "contractId", message: "Este contrato está inativo." },
    ]);
  if (!contract.client.isActive || contract.client.deletedAt) {
    throw new ValidationError("Cliente inativo.", [
      { path: "clientId", message: "Este cliente está inativo." },
    ]);
  }
  return contract;
}

// ---------------------------------------------------------------------------
// criacao e cabecalho
// ---------------------------------------------------------------------------

export async function createMeasurement(
  user: SessionUser,
  data: CreateMeasurementData,
  actor: AuditActor,
) {
  await validateContract(data.clientId, data.contractId);
  const issueDate = dateOnlyToUtc(data.issueDate);
  return prisma.$transaction(async (tx) => {
    const number = await nextMeasurementNumber(tx, yearInTimezone(issueDate));
    const m = await tx.measurement.create({
      data: {
        number,
        clientId: data.clientId,
        contractId: data.contractId,
        competence: data.competence,
        startDate: dateOnlyToUtc(data.startDate),
        endDate: dateOnlyToUtc(data.endDate),
        issueDate,
        ownerUserId: user.id,
        frs: data.frs,
        purchaseOrder: data.purchaseOrder,
        notes: data.notes,
        status: MeasurementStatus.RASCUNHO,
      },
    });
    await audit(tx, {
      entity: "Measurement",
      entityId: m.id,
      action: "MEDICAO_CRIADA",
      actor,
      after: {
        number: m.number,
        status: m.status,
        clientId: m.clientId,
        contractId: m.contractId,
        competence: m.competence,
      },
    });
    return m;
  });
}

export async function updateMeasurementHeader(
  scope: Scope,
  id: string,
  data: MeasurementHeaderData,
  actor: AuditActor,
) {
  const before = await requireMeasurement(scope, id);
  assertEditable(before.status);
  if (data.contractId !== before.contractId)
    await validateContract(before.clientId, data.contractId);
  return prisma.$transaction(async (tx) => {
    const after = await tx.measurement.update({
      where: { id },
      data: {
        contractId: data.contractId,
        competence: data.competence,
        startDate: dateOnlyToUtc(data.startDate),
        endDate: dateOnlyToUtc(data.endDate),
        issueDate: dateOnlyToUtc(data.issueDate),
        frs: data.frs,
        purchaseOrder: data.purchaseOrder,
        notes: data.notes,
        otherAmount: data.otherAmount,
        discountAmount: data.discountAmount,
        additionAmount: data.additionAmount,
        taxAmount: data.taxAmount,
      },
    });
    const totals = await recalculateTotals(tx, id);
    if (new Decimal(totals.totalAmount).lt(0))
      throw new ValidationError("Os descontos não podem ser maiores que o subtotal.", [
        { path: "discountAmount", message: "Os descontos deixariam o total negativo." },
      ]);
    await audit(tx, {
      entity: "Measurement",
      entityId: id,
      action: "MEDICAO_ALTERADA",
      actor,
      before: headerSnapshot(before),
      after: { ...headerSnapshot(after), ...totals },
    });
    return { measurement: after, totals };
  });
}

function headerSnapshot(m: {
  contractId: string;
  competence: string;
  startDate: Date;
  endDate: Date;
  issueDate: Date;
  frs: string | null;
  purchaseOrder: string | null;
  notes: string | null;
  otherAmount: { toString(): string };
  discountAmount: { toString(): string };
  additionAmount: { toString(): string };
  taxAmount: { toString(): string };
}) {
  return {
    contractId: m.contractId,
    competence: m.competence,
    startDate: m.startDate.toISOString().slice(0, 10),
    endDate: m.endDate.toISOString().slice(0, 10),
    issueDate: m.issueDate.toISOString().slice(0, 10),
    frs: m.frs,
    purchaseOrder: m.purchaseOrder,
    notes: m.notes,
    otherAmount: m.otherAmount.toString(),
    discountAmount: m.discountAmount.toString(),
    additionAmount: m.additionAmount.toString(),
    taxAmount: m.taxAmount.toString(),
  };
}

// ---------------------------------------------------------------------------
// itens (mao de obra e equipamentos) — implementacao unica por "kind"
// ---------------------------------------------------------------------------

type ItemData = LaborItemData | EquipmentItemData;

const ENTITY_BY_KIND: Record<ItemKind, AuditEntity> = {
  "mao-de-obra": "LaborItem",
  equipamentos: "EquipmentItem",
};

/** Linha de item (mao de obra tem `role`, equipamento tem `name`). */
export interface ItemRow {
  id: string;
  measurementId: string;
  code: string;
  role?: string;
  name?: string;
  description: string | null;
  quantity: { toString(): string };
  unit: string;
  daysHours: { toString(): string };
  unitPrice: { toString(): string };
  totalPrice: { toString(): string };
  sortOrder: number;
}

interface ItemRecord {
  code: string;
  role?: string;
  name?: string;
  description: string | null;
  quantity: string;
  unit: string;
  daysHours: string;
  unitPrice: string;
  totalPrice: string;
  sortOrder: number;
}

/** Adaptador tipado sobre os dois modelos Prisma, que tem a mesma forma exceto role/name. */
interface ItemTable {
  findOne(measurementId: string, id: string): Promise<ItemRow | null>;
  listIds(measurementId: string): Promise<Array<{ id: string; sortOrder: number }>>;
  maxSortOrder(measurementId: string): Promise<number | null>;
  /** Desloca em `delta` o sortOrder de todos os itens com sortOrder > `after` (uma consulta). */
  shift(measurementId: string, after: number, delta: 1 | -1): Promise<void>;
  create(measurementId: string, data: ItemRecord): Promise<ItemRow>;
  update(id: string, data: Partial<ItemRecord>): Promise<ItemRow>;
  remove(id: string): Promise<void>;
}

function itemTable(tx: Tx, kind: ItemKind): ItemTable {
  if (kind === "mao-de-obra") {
    return {
      findOne: (measurementId, id) => tx.laborItem.findFirst({ where: { id, measurementId } }),
      listIds: (measurementId) =>
        tx.laborItem.findMany({
          where: { measurementId },
          orderBy: { sortOrder: "asc" },
          select: { id: true, sortOrder: true },
        }),
      maxSortOrder: async (measurementId) =>
        (await tx.laborItem.aggregate({ where: { measurementId }, _max: { sortOrder: true } }))._max
          .sortOrder,
      shift: async (measurementId, after, delta) => {
        await tx.laborItem.updateMany({
          where: { measurementId, sortOrder: { gt: after } },
          data: { sortOrder: delta > 0 ? { increment: 1 } : { decrement: 1 } },
        });
      },
      create: (measurementId, { name: _n, ...data }) =>
        tx.laborItem.create({ data: { ...data, role: data.role ?? "", measurementId } }),
      update: (id, { name: _n, ...data }) => tx.laborItem.update({ where: { id }, data }),
      remove: async (id) => {
        await tx.laborItem.delete({ where: { id } });
      },
    };
  }
  return {
    findOne: (measurementId, id) => tx.equipmentItem.findFirst({ where: { id, measurementId } }),
    listIds: (measurementId) =>
      tx.equipmentItem.findMany({
        where: { measurementId },
        orderBy: { sortOrder: "asc" },
        select: { id: true, sortOrder: true },
      }),
    maxSortOrder: async (measurementId) =>
      (await tx.equipmentItem.aggregate({ where: { measurementId }, _max: { sortOrder: true } }))
        ._max.sortOrder,
    shift: async (measurementId, after, delta) => {
      await tx.equipmentItem.updateMany({
        where: { measurementId, sortOrder: { gt: after } },
        data: { sortOrder: delta > 0 ? { increment: 1 } : { decrement: 1 } },
      });
    },
    create: (measurementId, { role: _r, ...data }) =>
      tx.equipmentItem.create({ data: { ...data, name: data.name ?? "", measurementId } }),
    update: (id, { role: _r, ...data }) => tx.equipmentItem.update({ where: { id }, data }),
    remove: async (id) => {
      await tx.equipmentItem.delete({ where: { id } });
    },
  };
}

function itemRecord(kind: ItemKind, data: ItemData, sortOrder: number): ItemRecord {
  const common = {
    code: data.code,
    description: data.description,
    quantity: data.quantity,
    unit: data.unit,
    daysHours: data.daysHours,
    unitPrice: data.unitPrice,
    totalPrice: computeItemTotal(data.quantity, data.unitPrice).toFixed(2),
    sortOrder,
  };
  return kind === "mao-de-obra"
    ? { ...common, role: (data as LaborItemData).role }
    : { ...common, name: (data as EquipmentItemData).name };
}

function plain(row: ItemRow) {
  return {
    id: row.id,
    code: row.code,
    role: row.role,
    name: row.name,
    description: row.description,
    quantity: row.quantity.toString(),
    unit: row.unit,
    daysHours: row.daysHours.toString(),
    unitPrice: row.unitPrice.toString(),
    totalPrice: round2(row.totalPrice.toString()).toFixed(2),
    sortOrder: row.sortOrder,
  };
}

async function logItem(
  tx: Tx,
  kind: ItemKind,
  measurementId: string,
  itemId: string,
  action: AuditAction,
  actor: AuditActor,
  before?: ItemRow,
  after?: ItemRow & { duplicadoDe?: string },
) {
  await audit(tx, {
    entity: ENTITY_BY_KIND[kind],
    entityId: itemId,
    actor,
    action,
    before: before ? { measurementId, ...plain(before) } : undefined,
    after: after
      ? { measurementId, ...plain(after), duplicadoDe: after.duplicadoDe }
      : { measurementId },
  });
}

export async function addItem(
  scope: Scope,
  measurementId: string,
  kind: ItemKind,
  data: ItemData,
  actor: AuditActor,
) {
  const m = await requireMeasurement(scope, measurementId);
  assertEditable(m.status);
  return prisma.$transaction(async (tx) => {
    const t = itemTable(tx, kind);
    const max = await t.maxSortOrder(measurementId);
    const item = await t.create(measurementId, itemRecord(kind, data, max === null ? 0 : max + 1));
    const totals = await recalculateTotals(tx, measurementId);
    await logItem(tx, kind, measurementId, item.id, "ITEM_CRIADO", actor, undefined, item);
    return { item: plain(item), totals };
  });
}

export async function updateItem(
  scope: Scope,
  measurementId: string,
  kind: ItemKind,
  itemId: string,
  data: ItemData,
  actor: AuditActor,
) {
  const m = await requireMeasurement(scope, measurementId);
  assertEditable(m.status);
  return prisma.$transaction(async (tx) => {
    const t = itemTable(tx, kind);
    const before = await t.findOne(measurementId, itemId);
    if (!before) throw new NotFoundError("Item não encontrado.");
    const item = await t.update(itemId, itemRecord(kind, data, before.sortOrder));
    const totals = await recalculateTotals(tx, measurementId);
    await logItem(tx, kind, measurementId, itemId, "ITEM_ALTERADO", actor, before, item);
    return { item: plain(item), totals };
  });
}

export async function deleteItem(
  scope: Scope,
  measurementId: string,
  kind: ItemKind,
  itemId: string,
  actor: AuditActor,
) {
  const m = await requireMeasurement(scope, measurementId);
  assertEditable(m.status);
  return prisma.$transaction(async (tx) => {
    const t = itemTable(tx, kind);
    const before = await t.findOne(measurementId, itemId);
    if (!before) throw new NotFoundError("Item não encontrado.");
    await t.remove(itemId);
    // fecha o espaco em uma unica consulta (antes: um update por item restante)
    await t.shift(measurementId, before.sortOrder, -1);
    const totals = await recalculateTotals(tx, measurementId);
    await logItem(tx, kind, measurementId, itemId, "ITEM_EXCLUIDO", actor, before, undefined);
    return { totals };
  });
}

export async function duplicateItem(
  scope: Scope,
  measurementId: string,
  kind: ItemKind,
  itemId: string,
  actor: AuditActor,
) {
  const m = await requireMeasurement(scope, measurementId);
  assertEditable(m.status);
  return prisma.$transaction(async (tx) => {
    const t = itemTable(tx, kind);
    const source = await t.findOne(measurementId, itemId);
    if (!source) throw new NotFoundError("Item não encontrado.");
    // abre espaco logo apos o item de origem em uma unica consulta
    await t.shift(measurementId, source.sortOrder, 1);
    const item = await t.create(measurementId, {
      code: source.code,
      role: source.role,
      name: source.name,
      description: source.description,
      quantity: source.quantity.toString(),
      unit: source.unit,
      daysHours: source.daysHours.toString(),
      unitPrice: source.unitPrice.toString(),
      totalPrice: source.totalPrice.toString(),
      sortOrder: source.sortOrder + 1,
    });
    const totals = await recalculateTotals(tx, measurementId);
    await logItem(tx, kind, measurementId, item.id, "ITEM_CRIADO", actor, undefined, {
      ...item,
      duplicadoDe: itemId,
    });
    return { item: plain(item), totals };
  });
}

export async function reorderItems(
  scope: Scope,
  measurementId: string,
  kind: ItemKind,
  ids: string[],
  actor: AuditActor,
) {
  const m = await requireMeasurement(scope, measurementId);
  assertEditable(m.status);
  return prisma.$transaction(async (tx) => {
    const t = itemTable(tx, kind);
    const currentIds = (await t.listIds(measurementId)).map((c) => c.id);
    if (
      ids.length !== currentIds.length ||
      !ids.every((id) => currentIds.includes(id)) ||
      new Set(ids).size !== ids.length
    ) {
      throw new ValidationError("A lista de itens para reordenar não confere com a medição.");
    }
    for (const [i, id] of ids.entries()) await t.update(id, { sortOrder: i });
    await audit(tx, {
      entity: "Measurement",
      entityId: measurementId,
      action: "ITEM_ALTERADO",
      actor,
      before: { ordem: currentIds, tipo: kind },
      after: { ordem: ids, tipo: kind },
    });
    return { ids };
  });
}

// ---------------------------------------------------------------------------
// transicoes de status
// ---------------------------------------------------------------------------

export interface TransitionOptions {
  reason?: string;
}

/** Destinos com fluxo proprio: envio (versao/PDF/token), portal do cliente e anexo de NF. */
const FLOW_ONLY_TARGETS: readonly MeasurementStatus[] = [
  MeasurementStatus.ENVIADO_AO_CLIENTE,
  MeasurementStatus.EM_APROVACAO,
  MeasurementStatus.APROVADO,
  MeasurementStatus.CORRECAO_SOLICITADA,
  MeasurementStatus.ASSINADO,
  MeasurementStatus.NF_ANEXADA,
];

/**
 * Transicao generica pela tabela da maquina de estados, para atores de sessao.
 * Transicoes com efeitos proprios (envio, aprovacao, correcao, assinatura, NF) tem services
 * dedicados e sao recusadas aqui; o papel CLIENTE nunca transita por sessao (so pelo portal).
 * O update e compare-and-set (status lido = status gravado): duas transicoes concorrentes
 * nao gravam uma por cima da outra.
 */
export async function transitionMeasurement(
  user: SessionUser,
  scope: Scope,
  id: string,
  to: MeasurementStatus,
  actor: AuditActor,
  options: TransitionOptions = {},
) {
  const m = await requireMeasurement(scope, id);
  if (user.role === Role.CLIENTE)
    throw new ForbiddenError("Aprovação e assinatura são feitas pelo portal do cliente.");
  const transition = assertTransition(m.status, to, user.role);
  if (FLOW_ONLY_TARGETS.includes(to))
    throw new TransitionError(
      'Esta transição tem fluxo próprio: use "Enviar ao cliente", o portal do cliente ou o anexo da nota fiscal.',
    );

  const estorno = m.status === MeasurementStatus.FATURADO && to === MeasurementStatus.EM_ELABORACAO;
  return prisma.$transaction(async (tx) => {
    await checkGuards(tx, transition.guards ?? [], m.id, options);
    const updated = await tx.measurement.updateMany({
      where: { id, status: m.status },
      data: {
        status: to,
        canceledAt: to === MeasurementStatus.CANCELADO ? new Date() : m.canceledAt,
      },
    });
    if (updated.count !== 1)
      throw new ConflictError("A medição foi alterada por outro usuário. Recarregue a página.");
    const after = await tx.measurement.findUniqueOrThrow({ where: { id } });
    if (estorno) {
      // a NF faturada deixa de valer para esta medicao; o registro permanece no historico
      const invoice = await tx.invoice.findUnique({ where: { measurementId: id } });
      if (invoice && invoice.status !== "CANCELADA") {
        await tx.invoice.update({ where: { id: invoice.id }, data: { status: "CANCELADA" } });
        await audit(tx, {
          entity: "Invoice",
          entityId: invoice.id,
          action: "NF_ALTERADA",
          actor,
          before: { measurementId: id, status: invoice.status },
          after: { measurementId: id, status: "CANCELADA", motivo: "Estorno da medição" },
        });
      }
    }
    await audit(tx, {
      entity: "Measurement",
      entityId: id,
      action: estorno ? "ESTORNO" : "STATUS_ALTERADO",
      actor,
      before: { status: m.status },
      after: { status: to, ...(options.reason ? { motivo: options.reason } : {}) },
    });
    return after;
  });
}

async function checkGuards(
  db: Db,
  guards: readonly TransitionGuard[],
  measurementId: string,
  options: TransitionOptions,
) {
  for (const guard of guards) {
    switch (guard) {
      case "EXIGE_MOTIVO":
        if (!options.reason?.trim())
          throw new ValidationError("Informe o motivo.", [
            { path: "reason", message: "Informe o motivo." },
          ]);
        break;
      case "TEM_ITENS": {
        const [labor, equipment, m] = await Promise.all([
          db.laborItem.count({ where: { measurementId } }),
          db.equipmentItem.count({ where: { measurementId } }),
          db.measurement.findUniqueOrThrow({
            where: { id: measurementId },
            select: { totalAmount: true },
          }),
        ]);
        if (labor + equipment === 0)
          throw new TransitionError(
            "Inclua ao menos um item de mão de obra ou equipamento antes de prosseguir.",
          );
        if (m.totalAmount.lt(0))
          throw new TransitionError(
            "O total da medição está negativo (descontos maiores que o subtotal). Ajuste antes de prosseguir.",
          );
        break;
      }
      case "TEM_ASSINATURA": {
        const m = await db.measurement.findUniqueOrThrow({
          where: { id: measurementId },
          select: { currentVersion: true },
        });
        const signature = await db.signature.findFirst({
          where: { measurementId, version: { version: m.currentVersion } },
        });
        if (!signature)
          throw new TransitionError(
            "Não é possível liberar para faturamento sem a assinatura eletrônica do cliente na versão vigente.",
          );
        break;
      }
      case "TEM_NF_COMPLETA": {
        const invoice = await db.invoice.findUnique({ where: { measurementId } });
        if (
          !invoice ||
          invoice.status === "CANCELADA" ||
          !invoice.number ||
          !invoice.issueDate ||
          invoice.amount.lte(0) ||
          !invoice.pdfDocumentId ||
          !invoice.xmlDocumentId
        ) {
          throw new TransitionError(
            "Anexe a nota fiscal (PDF e XML) com número, data de emissão e valor antes de faturar.",
          );
        }
        break;
      }
      case "TEM_APROVADOR":
        // O envio ao cliente tem fluxo proprio (versao, PDF, token, e-mail).
        throw new TransitionError('O envio ao cliente é feito pelo botão "Enviar ao cliente".');
    }
  }
}

/** Papel do ator para a maquina de estados (usuarios logados). */
export function actorRole(user: SessionUser): Role {
  return user.role;
}

// ---------------------------------------------------------------------------
// importacao de planilha (Secao 10) — tudo ou nada
// ---------------------------------------------------------------------------

export type ImportMode = "substituir" | "adicionar";

export interface ImportSummary {
  labor: number;
  equipment: number;
  mode: ImportMode;
  totals: MeasurementTotals;
}

/**
 * Grava os itens ja validados pelo parser. `substituir` apaga os itens existentes das abas
 * presentes no arquivo; `adicionar` inclui apos os existentes. Transacao unica.
 */
export async function importItems(
  scope: Scope,
  measurementId: string,
  parsed: {
    laborItems: LaborItemData[];
    equipmentItems: EquipmentItemData[];
    sheets: { labor: boolean; equipment: boolean };
  },
  mode: ImportMode,
  actor: AuditActor,
): Promise<ImportSummary> {
  const m = await requireMeasurement(scope, measurementId);
  assertEditable(m.status);
  return prisma.$transaction(async (tx) => {
    const before = {
      labor: await tx.laborItem.count({ where: { measurementId } }),
      equipment: await tx.equipmentItem.count({ where: { measurementId } }),
    };
    if (mode === "substituir") {
      if (parsed.sheets.labor) await tx.laborItem.deleteMany({ where: { measurementId } });
      if (parsed.sheets.equipment) await tx.equipmentItem.deleteMany({ where: { measurementId } });
    }
    const laborStart = mode === "substituir" && parsed.sheets.labor ? 0 : before.labor;
    const equipmentStart = mode === "substituir" && parsed.sheets.equipment ? 0 : before.equipment;
    if (parsed.laborItems.length) {
      await tx.laborItem.createMany({
        data: parsed.laborItems.map((d, i) => ({
          ...itemRecord("mao-de-obra", d, laborStart + i),
          role: d.role,
          measurementId,
        })),
      });
    }
    if (parsed.equipmentItems.length) {
      await tx.equipmentItem.createMany({
        data: parsed.equipmentItems.map((d, i) => ({
          ...itemRecord("equipamentos", d, equipmentStart + i),
          name: d.name,
          measurementId,
        })),
      });
    }
    const totals = await recalculateTotals(tx, measurementId);
    await audit(tx, {
      entity: "Measurement",
      entityId: measurementId,
      action: "ITENS_IMPORTADOS",
      actor,
      before: { maoDeObra: before.labor, equipamentos: before.equipment },
      after: {
        modo: mode,
        maoDeObra: parsed.laborItems.length,
        equipamentos: parsed.equipmentItems.length,
        ...totals,
      },
    });
    return {
      labor: parsed.laborItems.length,
      equipment: parsed.equipmentItems.length,
      mode,
      totals,
    };
  });
}
