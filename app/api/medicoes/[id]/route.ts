import { NextResponse } from "next/server";
import { withApi, readJson, actorFromRequest } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import { measurementHeaderSchema } from "@/lib/validation/measurement";
import { getMeasurement, updateMeasurementHeader } from "@/lib/services/measurement.service";
import { toMeasurementDto } from "@/lib/services/measurement-dto";

export const GET = withApi(async (_req, ctx) => {
  const user = await requireAction("medicao:ver");
  const { id } = await ctx.params;
  const m = await getMeasurement(getScope(user), idSchema.parse(id));
  return NextResponse.json(toMeasurementDto(m));
});

export const PATCH = withApi(async (req, ctx) => {
  const user = await requireAction("medicao:editar");
  const { id } = await ctx.params;
  const data = measurementHeaderSchema.parse(await readJson(req));
  const result = await updateMeasurementHeader(
    getScope(user),
    idSchema.parse(id),
    data,
    actorFromRequest(user, req),
  );
  return NextResponse.json({ totals: result.totals });
});
