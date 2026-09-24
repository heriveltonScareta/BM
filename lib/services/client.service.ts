import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/db/generated/client";
import type { Scope } from "@/lib/auth/scope";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { audit, type AuditActor } from "@/lib/services/audit.service";
import {
  findClientBasic,
  findClientById,
  listClients,
  listClientOptions,
  listClientsForSelection,
} from "@/lib/db/repositories/client.repository";
import type {
  ClientData,
  ClientListQuery,
  ContactData,
  ContractData,
} from "@/lib/validation/client";
import { dateOnlyToUtc } from "@/lib/utils/dates";
import type { Paginated } from "@/lib/validation/common";

export type { ClientDetail, ClientListRow } from "@/lib/db/repositories/client.repository";

function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function uniqueMessage(error: Prisma.PrismaClientKnownRequestError, fallback: string): string {
  const target = (error.meta?.target as string[] | string | undefined) ?? "";
  const fields = Array.isArray(target) ? target.join(",") : String(target);
  if (fields.includes("cnpj")) return "Já existe um cliente com este CNPJ.";
  if (fields.includes("code")) return "Já existe um registro com este código.";
  return fallback;
}

export async function getClients(scope: Scope, query: ClientListQuery) {
  const { items, total } = await listClients(prisma, scope, query);
  const result: Paginated<(typeof items)[number]> = {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
  return result;
}

export async function getClient(scope: Scope, id: string) {
  const client = await findClientById(prisma, scope, id);
  if (!client) throw new NotFoundError("Cliente não encontrado.");
  return client;
}

export function getClientsForSelection(scope: Scope) {
  return listClientsForSelection(prisma, scope);
}

/** Opcoes leves (id e nome) para filtros de listagem. */
export function getClientOptions(scope: Scope) {
  return listClientOptions(prisma, scope);
}

export async function createClient(data: ClientData, actor: AuditActor) {
  try {
    return await prisma.$transaction(async (tx) => {
      const client = await tx.client.create({ data });
      await audit(tx, {
        entity: "Client",
        entityId: client.id,
        action: "CLIENTE_CRIADO",
        actor,
        after: client,
      });
      return client;
    });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new ConflictError(uniqueMessage(error, "Cliente já cadastrado."));
    throw error;
  }
}

export async function updateClient(scope: Scope, id: string, data: ClientData, actor: AuditActor) {
  const before = await findClientBasic(prisma, scope, id);
  if (!before) throw new NotFoundError("Cliente não encontrado.");
  try {
    return await prisma.$transaction(async (tx) => {
      const after = await tx.client.update({ where: { id }, data });
      await audit(tx, {
        entity: "Client",
        entityId: id,
        action: "CLIENTE_ALTERADO",
        actor,
        before,
        after,
      });
      return after;
    });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new ConflictError(uniqueMessage(error, "Cliente já cadastrado."));
    throw error;
  }
}

export async function setClientActive(
  scope: Scope,
  id: string,
  isActive: boolean,
  actor: AuditActor,
) {
  const before = await findClientBasic(prisma, scope, id);
  if (!before) throw new NotFoundError("Cliente não encontrado.");
  if (before.isActive === isActive) return before;
  return prisma.$transaction(async (tx) => {
    const after = await tx.client.update({ where: { id }, data: { isActive } });
    await audit(tx, {
      entity: "Client",
      entityId: id,
      action: "CLIENTE_ALTERADO",
      actor,
      before: { isActive: before.isActive },
      after: { isActive },
    });
    return after;
  });
}

/** Exclusao logica. Bloqueada quando o cliente possui medicoes (use inativacao). */
export async function deleteClient(scope: Scope, id: string, actor: AuditActor) {
  const client = await findClientById(prisma, scope, id);
  if (!client) throw new NotFoundError("Cliente não encontrado.");
  if (client._count.measurements > 0) {
    throw new AppError(
      "Este cliente possui medições e não pode ser excluído. Inative-o para ocultá-lo das novas medições.",
      409,
      "CLIENT_HAS_MEASUREMENTS",
    );
  }
  const linkedUsers = await prisma.user.count({ where: { clientId: id, isActive: true } });
  if (linkedUsers > 0) {
    throw new AppError(
      "Este cliente possui usuários ativos vinculados. Inative-os antes de excluir.",
      409,
      "CLIENT_HAS_USERS",
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.client.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await audit(tx, {
      entity: "Client",
      entityId: id,
      action: "CLIENTE_EXCLUIDO",
      actor,
      before: client,
    });
  });
}

// ---------------------------------------------------------------------------
// contatos
// ---------------------------------------------------------------------------

async function requireClient(scope: Scope, clientId: string) {
  const client = await findClientBasic(prisma, scope, clientId);
  if (!client) throw new NotFoundError("Cliente não encontrado.");
  return client;
}

export async function createContact(
  scope: Scope,
  clientId: string,
  data: ContactData,
  actor: AuditActor,
) {
  await requireClient(scope, clientId);
  return prisma.$transaction(async (tx) => {
    const contact = await tx.clientContact.create({ data: { ...data, clientId } });
    await audit(tx, {
      entity: "ClientContact",
      entityId: contact.id,
      action: "CONTATO_CRIADO",
      actor,
      after: contact,
    });
    return contact;
  });
}

export async function updateContact(
  scope: Scope,
  clientId: string,
  contactId: string,
  data: ContactData,
  actor: AuditActor,
) {
  await requireClient(scope, clientId);
  const before = await prisma.clientContact.findFirst({ where: { id: contactId, clientId } });
  if (!before) throw new NotFoundError("Contato não encontrado.");
  return prisma.$transaction(async (tx) => {
    const after = await tx.clientContact.update({ where: { id: contactId }, data });
    await audit(tx, {
      entity: "ClientContact",
      entityId: contactId,
      action: "CONTATO_ALTERADO",
      actor,
      before,
      after,
    });
    return after;
  });
}

export async function deleteContact(
  scope: Scope,
  clientId: string,
  contactId: string,
  actor: AuditActor,
) {
  await requireClient(scope, clientId);
  const before = await prisma.clientContact.findFirst({ where: { id: contactId, clientId } });
  if (!before) throw new NotFoundError("Contato não encontrado.");
  await prisma.$transaction(async (tx) => {
    await tx.clientContact.delete({ where: { id: contactId } });
    await audit(tx, {
      entity: "ClientContact",
      entityId: contactId,
      action: "CONTATO_ALTERADO",
      actor,
      before,
      after: { removido: true },
    });
  });
}

// ---------------------------------------------------------------------------
// contratos
// ---------------------------------------------------------------------------

function contractData(data: ContractData) {
  return {
    code: data.code,
    name: data.name,
    unit: data.unit,
    startDate: dateOnlyToUtc(data.startDate),
    endDate: data.endDate ? dateOnlyToUtc(data.endDate) : null,
    isActive: data.isActive,
  };
}

export async function createContract(
  scope: Scope,
  clientId: string,
  data: ContractData,
  actor: AuditActor,
) {
  await requireClient(scope, clientId);
  try {
    return await prisma.$transaction(async (tx) => {
      const contract = await tx.contract.create({ data: { ...contractData(data), clientId } });
      await audit(tx, {
        entity: "Contract",
        entityId: contract.id,
        action: "CONTRATO_CRIADO",
        actor,
        after: contract,
      });
      return contract;
    });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new ConflictError("Já existe um contrato com este código para o cliente.");
    throw error;
  }
}

export async function updateContract(
  scope: Scope,
  clientId: string,
  contractId: string,
  data: ContractData,
  actor: AuditActor,
) {
  await requireClient(scope, clientId);
  const before = await prisma.contract.findFirst({ where: { id: contractId, clientId } });
  if (!before) throw new NotFoundError("Contrato não encontrado.");
  try {
    return await prisma.$transaction(async (tx) => {
      const after = await tx.contract.update({
        where: { id: contractId },
        data: contractData(data),
      });
      await audit(tx, {
        entity: "Contract",
        entityId: contractId,
        action: "CONTRATO_ALTERADO",
        actor,
        before,
        after,
      });
      return after;
    });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new ConflictError("Já existe um contrato com este código para o cliente.");
    throw error;
  }
}
