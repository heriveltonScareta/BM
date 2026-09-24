import type { Db } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/db/generated/client";
import { measurementScopeWhere, type Scope } from "@/lib/auth/scope";
import type { MeasurementListQuery } from "@/lib/validation/measurement";

export const measurementListSelect = {
  id: true,
  number: true,
  competence: true,
  startDate: true,
  endDate: true,
  issueDate: true,
  frs: true,
  purchaseOrder: true,
  status: true,
  currentVersion: true,
  totalAmount: true,
  updatedAt: true,
  client: { select: { id: true, code: true, tradeName: true } },
  contract: { select: { id: true, code: true, name: true, unit: true } },
  invoice: { select: { number: true, status: true, issueDate: true, amount: true, sentAt: true } },
} satisfies Prisma.MeasurementSelect;

export type MeasurementListRow = Prisma.MeasurementGetPayload<{
  select: typeof measurementListSelect;
}>;

export const measurementDetailInclude = {
  client: {
    select: { id: true, code: true, tradeName: true, legalName: true, cnpj: true, isActive: true },
  },
  contract: { select: { id: true, code: true, name: true, unit: true, isActive: true } },
  owner: { select: { id: true, name: true, email: true } },
  laborItems: { orderBy: { sortOrder: "asc" } },
  equipmentItems: { orderBy: { sortOrder: "asc" } },
  invoice: true,
  _count: {
    select: { versions: true, signatures: true, documents: { where: { deletedAt: null } } },
  },
} satisfies Prisma.MeasurementInclude;

export type MeasurementDetail = Prisma.MeasurementGetPayload<{
  include: typeof measurementDetailInclude;
}>;

function withScope(
  where: Prisma.MeasurementWhereInput,
  scope: Scope,
): Prisma.MeasurementWhereInput {
  return { AND: [where, measurementScopeWhere(scope)] };
}

export async function listMeasurements(db: Db, scope: Scope, query: MeasurementListQuery) {
  const filters: Prisma.MeasurementWhereInput = {};
  if (query.status) filters.status = query.status;
  else if (query.statuses?.length) filters.status = { in: query.statuses };
  if (query.clientId) filters.clientId = query.clientId;
  if (query.competence) filters.competence = query.competence;
  if (query.q) {
    const q = query.q;
    filters.OR = [
      { number: { contains: q, mode: "insensitive" } },
      { frs: { contains: q, mode: "insensitive" } },
      { purchaseOrder: { contains: q, mode: "insensitive" } },
      { client: { tradeName: { contains: q, mode: "insensitive" } } },
      { contract: { code: { contains: q, mode: "insensitive" } } },
    ];
  }
  const where = withScope(filters, scope);
  const orderBy: Prisma.MeasurementOrderByWithRelationInput[] =
    query.sort === "client"
      ? [{ client: { tradeName: query.order } }, { number: "asc" }]
      : [{ [query.sort]: query.order }, { number: "asc" }];
  const [items, total] = await Promise.all([
    db.measurement.findMany({
      where,
      select: measurementListSelect,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.measurement.count({ where }),
  ]);
  return { items, total };
}

/** Sempre `AND: [{ id }, escopo]` — nunca spread (ver CLAUDE.md, isolamento). */
export function findMeasurementById(db: Db, scope: Scope, id: string) {
  return db.measurement.findFirst({
    where: withScope({ id }, scope),
    include: measurementDetailInclude,
  });
}

export function findMeasurementBasic(db: Db, scope: Scope, id: string) {
  return db.measurement.findFirst({ where: withScope({ id }, scope) });
}

/** Itens para recalculo (sem escopo: uso interno do service apos a verificacao). */
export function findItemsForTotals(db: Db, measurementId: string) {
  return db.measurement.findUniqueOrThrow({
    where: { id: measurementId },
    select: {
      id: true,
      otherAmount: true,
      discountAmount: true,
      additionAmount: true,
      taxAmount: true,
      laborItems: { select: { totalPrice: true } },
      equipmentItems: { select: { totalPrice: true } },
    },
  });
}

/** Trilha de auditoria da medicao e de tudo que a referencia (itens, versoes, NF, documentos...). */
export function listMeasurementAudit(db: Db, measurementId: string) {
  return db.auditLog.findMany({
    where: { measurementId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 500,
    select: {
      id: true,
      entity: true,
      entityId: true,
      action: true,
      actorLabel: true,
      actorUserId: true,
      before: true,
      after: true,
      ip: true,
      createdAt: true,
    },
  });
}
