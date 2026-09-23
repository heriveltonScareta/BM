import { NextResponse } from "next/server";
import { withApi, actorFromRequest } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import { markInvoiced } from "@/lib/services/billing.service";

export const POST = withApi(async (req, ctx) => {
  const user = await requireAction("faturamento:gerenciar");
  const { id } = await ctx.params;
  const r = await markInvoiced(
    user,
    getScope(user),
    idSchema.parse(id),
    actorFromRequest(user, req),
  );
  return NextResponse.json({ id: r.measurement.id, status: r.measurement.status, alert: r.alert });
});
