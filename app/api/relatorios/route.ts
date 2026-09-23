import { NextResponse } from "next/server";
import { withApi, parseQuery } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { reportFiltersSchema } from "@/lib/validation/report";
import { assertReportAllowed, getReport } from "@/lib/services/report.service";

export const GET = withApi(async (req) => {
  const user = await requireAction("relatorios:ver");
  const f = parseQuery(req, reportFiltersSchema);
  assertReportAllowed(user, f.tipo);
  return NextResponse.json(await getReport(getScope(user), f));
});
