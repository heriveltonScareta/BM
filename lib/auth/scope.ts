import { Role } from "@/lib/db/generated/enums";
import type { Prisma } from "@/lib/db/generated/client";
import type { SessionUser } from "./rbac";
import {
  CLIENT_VISIBLE_STATUSES,
  FINANCEIRO_VISIBLE_STATUSES,
} from "@/lib/services/status-machine";

/**
 * Escopo de dados derivado EXCLUSIVAMENTE da sessao do servidor (Secao 7 do briefing).
 * Nunca construa um Scope a partir de parametros enviados pelo navegador.
 * Todo repositorio que le/escreve dados de medicao recebe um Scope obrigatorio.
 */
export type Scope = { kind: "ALL" } | { kind: "FINANCEIRO" } | { kind: "CLIENT"; clientId: string };

export function getScope(user: SessionUser): Scope {
  switch (user.role) {
    case Role.ADMIN:
    case Role.OPERACIONAL:
      return { kind: "ALL" };
    case Role.FINANCEIRO:
      return { kind: "FINANCEIRO" };
    case Role.CLIENTE:
      if (!user.clientId) {
        // Usuario CLIENTE sem cliente vinculado nao enxerga nada.
        return { kind: "CLIENT", clientId: "__sem_cliente__" };
      }
      return { kind: "CLIENT", clientId: user.clientId };
  }
}

/** Fragmento `where` para Measurement conforme o escopo. Sempre exclui apagados. */
export function measurementScopeWhere(scope: Scope): Prisma.MeasurementWhereInput {
  const base: Prisma.MeasurementWhereInput = { deletedAt: null };
  switch (scope.kind) {
    case "ALL":
      return base;
    case "FINANCEIRO":
      return { ...base, status: { in: [...FINANCEIRO_VISIBLE_STATUSES] } };
    case "CLIENT":
      return {
        ...base,
        clientId: scope.clientId,
        status: { in: [...CLIENT_VISIBLE_STATUSES] },
      };
  }
}

/** Fragmento `where` para Client conforme o escopo. */
export function clientScopeWhere(scope: Scope): Prisma.ClientWhereInput {
  const base: Prisma.ClientWhereInput = { deletedAt: null };
  return scope.kind === "CLIENT" ? { ...base, id: scope.clientId } : base;
}

/** Fragmento `where` para Document conforme o escopo (via medicao ou cliente). */
export function documentScopeWhere(scope: Scope): Prisma.DocumentWhereInput {
  const base: Prisma.DocumentWhereInput = { deletedAt: null };
  switch (scope.kind) {
    case "ALL":
      return base;
    case "FINANCEIRO":
      return { ...base, measurement: measurementScopeWhere(scope) };
    case "CLIENT":
      return {
        ...base,
        OR: [
          { measurement: measurementScopeWhere(scope) },
          { measurementId: null, clientId: scope.clientId },
        ],
      };
  }
}

/** True quando o escopo permite enxergar um cliente especifico. */
export function scopeAllowsClient(scope: Scope, clientId: string): boolean {
  return scope.kind !== "CLIENT" || scope.clientId === clientId;
}
