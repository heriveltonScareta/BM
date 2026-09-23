import { NextResponse } from "next/server";
import { withApi, parseQuery } from "@/lib/api/handler";
import { requireSession, getScope } from "@/lib/auth/session";
import { searchQuerySchema } from "@/lib/validation/report";
import { globalSearch } from "@/lib/services/report.service";

export const GET = withApi(async (req) => {
  const user = await requireSession();
  const { q } = parseQuery(req, searchQuerySchema);
  return NextResponse.json(await globalSearch(user, getScope(user), q));
});
