import { NextResponse } from "next/server";
import { withApi, readJson, parseQuery, actorFromRequest } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { createMeasurementSchema, measurementListQuerySchema } from "@/lib/validation/measurement";
import { createMeasurement, getMeasurements } from "@/lib/services/measurement.service";

export const GET = withApi(async (req) => {
  const user = await requireAction("medicao:ver");
  const query = parseQuery(req, measurementListQuerySchema);
  return NextResponse.json(await getMeasurements(getScope(user), query));
});

export const POST = withApi(async (req) => {
  const user = await requireAction("medicao:criar");
  const data = createMeasurementSchema.parse(await readJson(req));
  const m = await createMeasurement(user, data, actorFromRequest(user, req));
  return NextResponse.json({ id: m.id, number: m.number, status: m.status }, { status: 201 });
});
