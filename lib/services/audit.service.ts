import type { Db } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/db/generated/client";
import type { SessionUser } from "@/lib/auth/rbac";

/**
 * Auditoria (Secao 14). O AuditLog e SOMENTE APPEND: este e o unico modulo que escreve
 * nele e nao existe funcao de update/delete.
 */
export interface AuditActor {
  userId?: string | null;
  label: string;
  ip?: string | null;
  userAgent?: string | null;
}

export type AuditAction =
  | "LOGIN"
  | "LOGIN_FALHOU"
  | "LOGOUT"
  | "SENHA_REDEFINIDA"
  | "USUARIO_CRIADO"
  | "USUARIO_ALTERADO"
  | "CLIENTE_CRIADO"
  | "CLIENTE_ALTERADO"
  | "CLIENTE_EXCLUIDO"
  | "CONTATO_CRIADO"
  | "CONTATO_ALTERADO"
  | "CONTRATO_CRIADO"
  | "CONTRATO_ALTERADO"
  | "MEDICAO_CRIADA"
  | "MEDICAO_ALTERADA"
  | "MEDICAO_EXCLUIDA"
  | "STATUS_ALTERADO"
  | "ITEM_CRIADO"
  | "ITEM_ALTERADO"
  | "ITEM_EXCLUIDO"
  | "ITENS_IMPORTADOS"
  | "VERSAO_CRIADA"
  | "ENVIADO_AO_CLIENTE"
  | "ABERTO_PELO_CLIENTE"
  | "APROVADO"
  | "CORRECAO_SOLICITADA"
  | "ASSINADO"
  | "DOCUMENTO_ENVIADO"
  | "DOCUMENTO_REMOVIDO"
  | "NF_ANEXADA"
  | "NF_ALTERADA"
  | "ESTORNO";

export type AuditEntity =
  | "User"
  | "Client"
  | "ClientContact"
  | "Contract"
  | "Measurement"
  | "LaborItem"
  | "EquipmentItem"
  | "MeasurementVersion"
  | "ApprovalRequest"
  | "Signature"
  | "Invoice"
  | "Document";

export interface AuditEntry {
  entity: AuditEntity;
  entityId: string;
  action: AuditAction;
  actor: AuditActor;
  before?: unknown;
  after?: unknown;
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  // Converte Decimal/Date para representacoes serializaveis.
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function audit(db: Db, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      actorUserId: entry.actor.userId ?? null,
      actorLabel: entry.actor.label,
      before: toJson(entry.before),
      after: toJson(entry.after),
      ip: entry.actor.ip ?? null,
      userAgent: entry.actor.userAgent ?? null,
    },
  });
}

export function actorFromUser(
  user: SessionUser,
  meta?: { ip?: string | null; userAgent?: string | null },
): AuditActor {
  return {
    userId: user.id,
    label: `${user.name} <${user.email}>`,
    ip: meta?.ip ?? null,
    userAgent: meta?.userAgent ?? null,
  };
}

export const SYSTEM_ACTOR: AuditActor = { label: "Sistema" };

export function portalActor(
  email: string,
  name: string,
  meta?: { ip?: string | null; userAgent?: string | null },
): AuditActor {
  return {
    label: `Portal do cliente: ${name} <${email}>`,
    ip: meta?.ip ?? null,
    userAgent: meta?.userAgent ?? null,
  };
}
