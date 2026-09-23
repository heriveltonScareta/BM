import { NextResponse } from "next/server";
import { withApi, readJson, getClientIp, getUserAgent } from "@/lib/api/handler";
import { portalGuard } from "@/lib/api/portal";
import { decisionSchema } from "@/lib/validation/approval";
import { decidePortal } from "@/lib/services/approval.service";

export const POST = withApi(async (req, ctx) => {
  const { token: raw } = await ctx.params;
  const token = await portalGuard(req, raw ?? "");
  const { decision, comment } = decisionSchema.parse(await readJson(req));
  const view = await decidePortal(token, decision, comment, {
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return NextResponse.json(view);
});
