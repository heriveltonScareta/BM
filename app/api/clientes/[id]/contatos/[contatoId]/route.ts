import { NextResponse } from "next/server";
import { withApi, readJson, actorFromRequest } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { contactSchema } from "@/lib/validation/client";
import { idSchema } from "@/lib/validation/common";
import { deleteContact, updateContact } from "@/lib/services/client.service";

export const PATCH = withApi(async (req, ctx) => {
  const user = await requireAction("clientes:gerenciar");
  const { id, contatoId } = await ctx.params;
  const data = contactSchema.parse(await readJson(req));
  const contact = await updateContact(
    getScope(user),
    idSchema.parse(id),
    idSchema.parse(contatoId),
    data,
    actorFromRequest(user, req),
  );
  return NextResponse.json(contact);
});

export const DELETE = withApi(async (req, ctx) => {
  const user = await requireAction("clientes:gerenciar");
  const { id, contatoId } = await ctx.params;
  await deleteContact(
    getScope(user),
    idSchema.parse(id),
    idSchema.parse(contatoId),
    actorFromRequest(user, req),
  );
  return new Response(null, { status: 204 });
});
