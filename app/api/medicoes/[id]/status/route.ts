import { NextResponse } from "next/server";
import { withApi, readJson, actorFromRequest } from "@/lib/api/handler";
import { requireSession, getScope } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import { transitionSchema } from "@/lib/validation/measurement";
import { transitionMeasurement } from "@/lib/services/measurement.service";

/**
 * Transicao generica de status. A permissao e decidida pela maquina de estados
 * (papel do ator na tabela TRANSITIONS), nao por uma acao fixa do RBAC.
 */
export const POST = withApi(async (req, ctx) => {
  const user = await requireSession();
  const { id } = await ctx.params;
  const { to, reason } = transitionSchema.parse(await readJson(req));
  const m = await transitionMeasurement(
    user,
    getScope(user),
    idSchema.parse(id),
    to,
    actorFromRequest(user, req),
    { reason },
  );
  return NextResponse.json({ id: m.id, status: m.status });
});
