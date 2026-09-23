import type { Db } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/db/generated/client";
import { clientScopeWhere, type Scope } from "@/lib/auth/scope";
import { onlyDigits } from "@/lib/validation/cnpj";
import type { ClientListQuery } from "@/lib/validation/client";

export const clientListSelect = {
  id: true,
  code: true,
  legalName: true,
  tradeName: true,
  cnpj: true,
  email: true,
  phone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: { contracts: true, contacts: true, measurements: { where: { deletedAt: null } } },
  },
} satisfies Prisma.ClientSelect;

export type ClientListRow = Prisma.ClientGetPayload<{ select: typeof clientListSelect }>;

export const clientDetailInclude = {
  contacts: { orderBy: [{ isApprover: "desc" }, { name: "asc" }] },
  contracts: { orderBy: [{ isActive: "desc" }, { startDate: "desc" }] },
  _count: { select: { measurements: { where: { deletedAt: null } } } },
} satisfies Prisma.ClientInclude;

export type ClientDetail = Prisma.ClientGetPayload<{ include: typeof clientDetailInclude }>;

export async function listClients(db: Db, scope: Scope, query: ClientListQuery) {
  const where: Prisma.ClientWhereInput = { ...clientScopeWhere(scope) };
  if (query.status === "ativos") where.isActive = true;
  if (query.status === "inativos") where.isActive = false;
  if (query.q) {
    const q = query.q;
    const digits = onlyDigits(q);
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { legalName: { contains: q, mode: "insensitive" } },
      { tradeName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      ...(digits ? [{ cnpj: { contains: digits } }] : []),
    ];
  }
  const [items, total] = await Promise.all([
    db.client.findMany({
      where,
      select: clientListSelect,
      orderBy: [{ [query.sort]: query.order }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.client.count({ where }),
  ]);
  return { items, total };
}

/**
 * Sempre compor `id` + escopo com AND: um spread (`{ id, ...scopeWhere }`) deixaria o `id`
 * do escopo sobrescrever o `id` pedido e quebraria o isolamento.
 */
export function findClientById(db: Db, scope: Scope, id: string) {
  return db.client.findFirst({
    where: { AND: [{ id }, clientScopeWhere(scope)] },
    include: clientDetailInclude,
  });
}

export function findClientBasic(db: Db, scope: Scope, id: string) {
  return db.client.findFirst({ where: { AND: [{ id }, clientScopeWhere(scope)] } });
}

/** Clientes ativos com contratos ativos e aprovadores, para o formulario de medicao. */
export function listClientsForSelection(db: Db, scope: Scope) {
  return db.client.findMany({
    where: { ...clientScopeWhere(scope), isActive: true },
    select: {
      id: true,
      code: true,
      tradeName: true,
      legalName: true,
      cnpj: true,
      contracts: {
        where: { isActive: true },
        select: { id: true, code: true, name: true, unit: true },
        orderBy: { code: "asc" },
      },
      contacts: {
        where: { isActive: true, isApprover: true },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { tradeName: "asc" },
  });
}
