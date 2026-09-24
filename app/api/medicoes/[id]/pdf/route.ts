import { bufferBody, withApi } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import { getMeasurement } from "@/lib/services/measurement.service";
import { getVersionPdf } from "@/lib/services/approval.service";
import { isEditable } from "@/lib/services/status-machine";
import { buildBoletimData, pdfFileName } from "@/lib/pdf/data";
import { renderBoletimPdf } from "@/lib/pdf/render";

/**
 * PDF da medicao: enquanto editavel, renderiza o estado atual (rascunho);
 * a partir do envio, serve o PDF congelado da versao vigente (sem renderizar de novo).
 */
export const GET = withApi(async (req, ctx) => {
  const user = await requireAction("medicao:ver");
  const { id } = await ctx.params;
  const scope = getScope(user);
  const m = await getMeasurement(scope, idSchema.parse(id));
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  const frozen =
    !isEditable(m.status) && m.currentVersion > 0
      ? await getVersionPdf(scope, m.id, m.currentVersion)
      : null;
  const pdf = frozen ? frozen.data : await renderBoletimPdf(buildBoletimData(m));
  const fileName = frozen ? frozen.fileName : pdfFileName(m.number, m.currentVersion);
  return new Response(bufferBody(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${fileName}"`,
      "cache-control": "no-store",
    },
  });
});
