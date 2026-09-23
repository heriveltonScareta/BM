import { NextResponse } from "next/server";
import { withApi } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import { getApprovalStatus } from "@/lib/services/approval.service";

export const GET = withApi(async (_req, ctx) => {
  const user = await requireAction("medicao:ver");
  const { id } = await ctx.params;
  return NextResponse.json(await getApprovalStatus(getScope(user), idSchema.parse(id)));
});
