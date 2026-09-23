import { MeasurementStatus, Role } from "@/lib/db/generated/enums";
import {
  FINANCEIRO_VISIBLE_STATUSES,
  CLIENT_VISIBLE_STATUSES,
} from "@/lib/services/status-machine";

/** Usuario da sessao (derivado do JWT no servidor). */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  clientId: string | null;
}

/**
 * Acoes do sistema (Secao 6 do briefing). O helper `can` e usado por TODA rota de API.
 * Esconder botao no front e apenas cosmetico.
 */
export type Action =
  | "usuarios:gerenciar"
  | "clientes:gerenciar"
  | "clientes:ver"
  | "medicao:criar"
  | "medicao:editar"
  | "medicao:enviar"
  | "medicao:cancelar"
  | "medicao:ver"
  | "medicao:estornar"
  | "faturamento:gerenciar"
  | "documentos:ver"
  | "documentos:upload"
  | "relatorios:ver"
  | "relatorios:financeiro"
  | "auditoria:ver"
  | "configuracoes:ver";

/** Recurso opcional para checagens que dependem de dono/status. */
export interface Resource {
  clientId?: string | null;
  status?: MeasurementStatus;
}

const MATRIX: Readonly<Record<Action, readonly Role[]>> = {
  "usuarios:gerenciar": ["ADMIN"],
  "clientes:gerenciar": ["ADMIN"],
  "clientes:ver": ["ADMIN", "OPERACIONAL", "FINANCEIRO"],
  "medicao:criar": ["ADMIN", "OPERACIONAL"],
  "medicao:editar": ["ADMIN", "OPERACIONAL"],
  "medicao:enviar": ["ADMIN"],
  "medicao:cancelar": ["ADMIN"],
  "medicao:ver": ["ADMIN", "OPERACIONAL", "FINANCEIRO", "CLIENTE"],
  "medicao:estornar": ["ADMIN"],
  "faturamento:gerenciar": ["ADMIN", "FINANCEIRO"],
  "documentos:ver": ["ADMIN", "OPERACIONAL", "FINANCEIRO", "CLIENTE"],
  "documentos:upload": ["ADMIN", "OPERACIONAL", "FINANCEIRO"],
  "relatorios:ver": ["ADMIN", "OPERACIONAL", "FINANCEIRO"],
  "relatorios:financeiro": ["ADMIN", "FINANCEIRO"],
  "auditoria:ver": ["ADMIN"],
  "configuracoes:ver": ["ADMIN"],
};

/**
 * `can(user, action, resource)`.
 * - Matriz de papeis por acao.
 * - CLIENTE: somente recursos do proprio clientId e a partir de ENVIADO_AO_CLIENTE.
 * - FINANCEIRO: medicoes somente de APROVADO em diante.
 */
export function can(
  user: SessionUser | null | undefined,
  action: Action,
  resource?: Resource,
): boolean {
  if (!user) return false;
  if (!MATRIX[action].includes(user.role)) return false;

  if (user.role === Role.CLIENTE) {
    if (!user.clientId) return false;
    if (resource?.clientId !== undefined && resource.clientId !== user.clientId) return false;
    if (resource?.status !== undefined && !CLIENT_VISIBLE_STATUSES.includes(resource.status)) {
      return false;
    }
  }

  if (user.role === Role.FINANCEIRO && resource?.status !== undefined) {
    if (action === "medicao:ver" || action === "documentos:ver") {
      return FINANCEIRO_VISIBLE_STATUSES.includes(resource.status);
    }
  }

  return true;
}

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  ADMIN: "Administrador",
  OPERACIONAL: "Operacional",
  FINANCEIRO: "Financeiro",
  CLIENTE: "Cliente",
};
