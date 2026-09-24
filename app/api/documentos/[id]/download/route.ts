import { bufferBody, withApi } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import { getDocumentForDownload } from "@/lib/services/document.service";

/** Unico caminho para baixar arquivos: autenticado e com verificacao de escopo (Secao 13). */
export const GET = withApi(async (req, ctx) => {
  const user = await requireAction("documentos:ver");
  const { id } = await ctx.params;
  const { doc, data } = await getDocumentForDownload(getScope(user), idSchema.parse(id));
  const inline =
    new URL(req.url).searchParams.get("inline") === "1" && doc.mimeType === "application/pdf";
  // view sobre o Buffer (sem copiar o arquivo uma segunda vez)
  return new Response(bufferBody(data), {
    headers: {
      "content-type": doc.mimeType,
      "content-length": String(data.byteLength),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${doc.fileName}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});
