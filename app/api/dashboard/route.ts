import { NextResponse } from "next/server";
import { withApi, parseQuery } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { dashboardQuerySchema } from "@/lib/validation/report";
import { getDashboard } from "@/lib/services/report.service";

export const GET = withApi(async (req) => {
  const user = await requireAction("medicao:ver");
  const { competence } = parseQuery(req, dashboardQuerySchema);
  return NextResponse.json(await getDashboard(getScope(user), { competence }));
});
