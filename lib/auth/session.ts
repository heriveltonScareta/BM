import { getServerSession } from "next-auth";
import { authOptions } from "./options";
import { can, type Action, type Resource, type SessionUser } from "./rbac";
import { getScope, type Scope } from "./scope";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

/** Usuario da sessao atual (ou null). Uso em server components e route handlers. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return session.user;
}

/** Exige sessao valida; lanca 401 (API) — nas paginas o proxy ja redireciona. */
export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Exige sessao + permissao para a acao. Lanca 403 quando nao permitido. */
export async function requireAction(action: Action, resource?: Resource): Promise<SessionUser> {
  const user = await requireSession();
  if (!can(user, action, resource)) throw new ForbiddenError();
  return user;
}

/** Sessao + escopo derivado dela (nunca do request). */
export async function requireScopedSession(): Promise<{ user: SessionUser; scope: Scope }> {
  const user = await requireSession();
  return { user, scope: getScope(user) };
}

export { can, getScope };
export type { Action, Resource, SessionUser, Scope };
