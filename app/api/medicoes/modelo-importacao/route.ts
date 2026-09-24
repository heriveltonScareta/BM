import { bufferBody, withApi } from "@/lib/api/handler";
import { requireAction } from "@/lib/auth/session";
import { buildTemplateWorkbook, TEMPLATE_FILE_NAME } from "@/lib/excel/template";

export const GET = withApi(async () => {
  await requireAction("medicao:editar");
  const buffer = buildTemplateWorkbook();
  return new Response(bufferBody(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${TEMPLATE_FILE_NAME}"`,
      "cache-control": "no-store",
    },
  });
});
