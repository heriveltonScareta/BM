import { NextResponse } from "next/server";
import { withApi, actorFromRequest } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import { releaseForBilling } from "@/lib/services/billing.service";

export const POST = withApi(async (req, ctx) => {
  const user = await requireAction("faturamento:gerenciar");
  const { id } = await ctx.params;
  const m = await releaseForBilling(
    user,
    getScope(user),
    idSchema.parse(id),
    actorFromRequest(user, req),
  );
  return NextResponse.json({ id: m.id, status: m.status });
});
