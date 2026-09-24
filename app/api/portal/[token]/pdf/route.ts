import { bufferBody, withApi } from "@/lib/api/handler";
import { portalGuard } from "@/lib/api/portal";
import { getPortalPdf } from "@/lib/services/approval.service";

export const GET = withApi(async (req, ctx) => {
  const { token: raw } = await ctx.params;
  const token = await portalGuard(req, raw ?? "");
  const { data, fileName } = await getPortalPdf(token);
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new Response(bufferBody(data), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${fileName}"`,
      "cache-control": "private, no-store",
    },
  });
});
