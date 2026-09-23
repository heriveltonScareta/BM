import { withApi } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import { getMeasurement } from "@/lib/services/measurement.service";
import { toMeasurementDto } from "@/lib/services/measurement-dto";
import { buildItemsWorkbook } from "@/lib/excel/export";

export const GET = withApi(async (_req, ctx) => {
  const user = await requireAction("medicao:ver");
  const { id } = await ctx.params;
  const m = toMeasurementDto(await getMeasurement(getScope(user), idSchema.parse(id)));
  const buffer = buildItemsWorkbook(m);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${m.number}-itens.xlsx"`,
      "cache-control": "no-store",
    },
  });
});
