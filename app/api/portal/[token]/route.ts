import { NextResponse } from "next/server";
import { withApi } from "@/lib/api/handler";
import { portalGuard } from "@/lib/api/portal";
import { getPortal } from "@/lib/services/approval.service";

/** Estado atual do portal (sem efeitos colaterais). */
export const GET = withApi(async (req, ctx) => {
  const { token: raw } = await ctx.params;
  const token = await portalGuard(req, raw ?? "");
  return NextResponse.json(await getPortal(token));
});
