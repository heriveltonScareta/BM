import type { SessionUser } from "@/lib/auth/rbac";
import { Role } from "@/lib/db/generated/enums";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";

const state = globalThis as unknown as { __sessionUser?: SessionUser | null };

/** Define o usuario da sessao simulada (null = sem sessao). */
export function asUser(user: SessionUser | null): void {
  state.__sessionUser = user;
}

export function toSessionUser(u: {
  id: string;
  name: string;
  email: string;
  role: Role;
  clientId: string | null;
}): SessionUser {
  return { id: u.id, name: u.name, email: u.email, role: u.role, clientId: u.clientId };
}

/** Cria os 4 perfis no banco de testes; `cliente` vinculado a `clientId`. */
export async function createTestUsers(clientId: string) {
  const passwordHash = await hashPassword("Senha@123");
  const mk = (name: string, email: string, role: Role, cid: string | null = null) =>
    prisma.user.create({ data: { name, email, passwordHash, role, clientId: cid } });
  const admin = toSessionUser(await mk("Admin", "admin@t.local", Role.ADMIN));
  const operacional = toSessionUser(await mk("Operacional", "op@t.local", Role.OPERACIONAL));
  const financeiro = toSessionUser(await mk("Financeiro", "fin@t.local", Role.FINANCEIRO));
  const cliente = toSessionUser(await mk("Cliente", "cli@t.local", Role.CLIENTE, clientId));
  return { admin, operacional, financeiro, cliente };
}

type Handler = (
  req: Request,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response>;

/** Invoca um route handler como o Next faria. */
export async function callRoute(
  handler: Handler,
  options: {
    method?: string;
    path: string;
    body?: unknown;
    params?: Record<string, string>;
    headers?: Record<string, string>;
  },
) {
  const url = `http://localhost${options.path}`;
  const init: RequestInit = { method: options.method ?? "GET", headers: { ...options.headers } };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { ...init.headers, "content-type": "application/json" };
  }
  const res = await handler(new Request(url, init), {
    params: Promise.resolve(options.params ?? {}),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json: json as never };
}
