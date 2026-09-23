import { NextResponse } from "next/server";
import { withApi, readJsonOptional, actorFromRequest } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import { sendSchema } from "@/lib/validation/approval";
import { resendApproval } from "@/lib/services/approval.service";

export const POST = withApi(async (req, ctx) => {
  const user = await requireAction("medicao:enviar");
  const { id } = await ctx.params;
  const body = sendSchema.parse(await readJsonOptional(req));
  const result = await resendApproval(
    user,
    getScope(user),
    idSchema.parse(id),
    body,
    actorFromRequest(user, req),
  );
  return NextResponse.json(result);
});
