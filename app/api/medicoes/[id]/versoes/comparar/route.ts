import { NextResponse } from "next/server";
import { withApi, parseQuery } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import { compareQuerySchema } from "@/lib/validation/approval";
import { compareVersions } from "@/lib/services/approval.service";

export const GET = withApi(async (req, ctx) => {
  const user = await requireAction("medicao:ver");
  const { id } = await ctx.params;
  const { a, b } = parseQuery(req, compareQuerySchema);
  return NextResponse.json(await compareVersions(getScope(user), idSchema.parse(id), a, b));
});
