import { z } from "zod";
import { bufferBody, withApi } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import { getVersionPdf } from "@/lib/services/approval.service";

export const GET = withApi(async (req, ctx) => {
  const user = await requireAction("medicao:ver");
  const { id, versao } = await ctx.params;
  const version = z.coerce.number().int().min(1).parse(versao);
  const { data, fileName } = await getVersionPdf(getScope(user), idSchema.parse(id), version);
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new Response(bufferBody(data), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${fileName}"`,
      "cache-control": "no-store",
    },
  });
});
