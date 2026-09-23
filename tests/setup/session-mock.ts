import { vi } from "vitest";
import type { SessionUser } from "@/lib/auth/rbac";

/**
 * Substitui o getServerSession do next-auth nos testes: a sessao "atual" e definida
 * pelos testes via `asUser()` (tests/setup/session.ts). Sem sessao definida => null.
 */
const state = globalThis as unknown as { __sessionUser?: SessionUser | null };
state.__sessionUser = null;

vi.mock("next-auth", () => ({
  getServerSession: async () => (state.__sessionUser ? { user: state.__sessionUser } : null),
  default: () => () => new Response(null, { status: 404 }),
}));
