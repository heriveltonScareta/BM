import { NextResponse } from "next/server";
import { withApi, readJson, parseQuery, actorFromRequest } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { clientListQuerySchema, clientSchema } from "@/lib/validation/client";
import { createClient, getClients } from "@/lib/services/client.service";

export const GET = withApi(async (req) => {
  const user = await requireAction("clientes:ver");
  const query = parseQuery(req, clientListQuerySchema);
  return NextResponse.json(await getClients(getScope(user), query));
});

export const POST = withApi(async (req) => {
  const user = await requireAction("clientes:gerenciar");
  const data = clientSchema.parse(await readJson(req));
  const client = await createClient(data, actorFromRequest(user, req));
  return NextResponse.json(client, { status: 201 });
});
