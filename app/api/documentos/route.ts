import { NextResponse } from "next/server";
import { withApi, parseQuery } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { documentListQuerySchema } from "@/lib/validation/invoice";
import { listDocuments } from "@/lib/services/document.service";

export const GET = withApi(async (req) => {
  const user = await requireAction("documentos:ver");
  const query = parseQuery(req, documentListQuerySchema);
  return NextResponse.json(await listDocuments(getScope(user), query));
});
