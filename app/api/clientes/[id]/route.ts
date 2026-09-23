import { NextResponse } from "next/server";
import { withApi, readJson, actorFromRequest } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { clientSchema } from "@/lib/validation/client";
import { idSchema } from "@/lib/validation/common";
import { deleteClient, getClient, updateClient } from "@/lib/services/client.service";

export const GET = withApi(async (_req, ctx) => {
  const user = await requireAction("clientes:ver");
  const { id } = await ctx.params;
  return NextResponse.json(await getClient(getScope(user), idSchema.parse(id)));
});

export const PATCH = withApi(async (req, ctx) => {
  const user = await requireAction("clientes:gerenciar");
  const { id } = await ctx.params;
  const data = clientSchema.parse(await readJson(req));
  const client = await updateClient(
    getScope(user),
    idSchema.parse(id),
    data,
    actorFromRequest(user, req),
  );
  return NextResponse.json(client);
});

export const DELETE = withApi(async (req, ctx) => {
  const user = await requireAction("clientes:gerenciar");
  const { id } = await ctx.params;
  await deleteClient(getScope(user), idSchema.parse(id), actorFromRequest(user, req));
  return new Response(null, { status: 204 });
});
