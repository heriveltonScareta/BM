import { prisma, type Tx } from "@/lib/db/prisma";
import { MeasurementStatus, Role } from "@/lib/db/generated/enums";
import type { Scope } from "@/lib/auth/scope";
import type { SessionUser } from "@/lib/auth/rbac";
import { AppError, NotFoundError, TransitionError, ValidationError } from "@/lib/errors";
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

export async function getMeasurementTimeline(scope: Scope, id: string) {
  const m = await findMeasurementBasic(prisma, scope, id);
  if (!m) throw new NotFoundError("Medição não encontrada.");
  return listMeasurementAudit(prisma, id);
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
    const rows = await t.listIds(measurementId);
    const sortOrder = rows.length ? Math.max(...rows.map((r) => r.sortOrder)) + 1 : 0;
    const item = await t.create(measurementId, itemRecord(kind, data, sortOrder));
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
    const rest = await t.listIds(measurementId);
    for (const [i, r] of rest.entries())
      if (r.sortOrder !== i) await t.update(r.id, { sortOrder: i });
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
    const rows = await t.listIds(measurementId);
    // abre espaco logo apos o item de origem (do maior para o menor, evitando colisao)
    for (const r of rows
      .filter((r) => r.sortOrder > source.sortOrder)
      .sort((a, b) => b.sortOrder - a.sortOrder)) {
      await t.update(r.id, { sortOrder: r.sortOrder + 1 });
    }
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

/**
 * Transicao generica pela tabela da maquina de estados. Transicoes com efeitos proprios
 * (envio, aprovacao, assinatura, liberacao, NF) tem services dedicados nas fases 4 e 5 e
 * sao recusadas aqui.
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
  const transition = assertTransition(m.status, to, user.role);
  await checkGuards(transition.guards ?? [], m.id, options);

  const estorno = m.status === MeasurementStatus.FATURADO && to === MeasurementStatus.EM_ELABORACAO;
  return prisma.$transaction(async (tx) => {
    const after = await tx.measurement.update({
      where: { id },
      data: {
        status: to,
        canceledAt: to === MeasurementStatus.CANCELADO ? new Date() : m.canceledAt,
      },
    });
    if (estorno) {
      // a NF faturada deixa de valer para esta medicao; o registro permanece no historico
      const invoice = await tx.invoice.findUnique({ where: { measurementId: id } });
      if (invoice) {
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
        const [labor, equipment] = await Promise.all([
          prisma.laborItem.count({ where: { measurementId } }),
          prisma.equipmentItem.count({ where: { measurementId } }),
        ]);
        if (labor + equipment === 0)
          throw new TransitionError(
            "Inclua ao menos um item de mão de obra ou equipamento antes de prosseguir.",
          );
        break;
      }
      case "TEM_ASSINATURA": {
        const m = await prisma.measurement.findUniqueOrThrow({
          where: { id: measurementId },
          select: { currentVersion: true },
        });
        const signature = await prisma.signature.findFirst({
          where: { measurementId, version: { version: m.currentVersion } },
        });
        if (!signature)
          throw new TransitionError(
            "Não é possível liberar para faturamento sem a assinatura eletrônica do cliente na versão vigente.",
          );
        break;
      }
      case "TEM_NF_COMPLETA": {
        const invoice = await prisma.invoice.findUnique({ where: { measurementId } });
        if (!invoice || !invoice.number || !invoice.issueDate || invoice.amount.lte(0)) {
          throw new TransitionError(
            "Anexe a nota fiscal com número, data de emissão e valor antes de faturar.",
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
