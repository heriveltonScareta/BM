import { withApi } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import { getMeasurement } from "@/lib/services/measurement.service";
import { buildBoletimData, pdfFileName } from "@/lib/pdf/data";
import { renderBoletimPdf } from "@/lib/pdf/render";

/** PDF do estado atual da medicao (rascunho ate a aprovacao). Versoes congeladas: Fase 4. */
export const GET = withApi(async (req, ctx) => {
  const user = await requireAction("medicao:ver");
  const { id } = await ctx.params;
  const m = await getMeasurement(getScope(user), idSchema.parse(id));
  const pdf = await renderBoletimPdf(buildBoletimData(m));
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${pdfFileName(m.number, m.currentVersion)}"`,
      "cache-control": "no-store",
    },
  });
});
