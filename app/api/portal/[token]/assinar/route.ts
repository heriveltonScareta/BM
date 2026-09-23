import { NextResponse } from "next/server";
import { withApi, readJson, getClientIp, getUserAgent } from "@/lib/api/handler";
import { portalGuard } from "@/lib/api/portal";
import { signSchema } from "@/lib/validation/approval";
import { signPortal } from "@/lib/services/approval.service";

export const POST = withApi(async (req, ctx) => {
  const { token: raw } = await ctx.params;
  const token = await portalGuard(req, raw ?? "");
  const { signerName } = signSchema.parse(await readJson(req));
  const view = await signPortal(
    token,
    { signerName },
    { ip: getClientIp(req), userAgent: getUserAgent(req) },
  );
  return NextResponse.json(view);
});
