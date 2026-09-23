import { NextResponse } from "next/server";
import { withApi, readJson, actorFromRequest } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import { equipmentItemSchema, itemKindSchema, laborItemSchema } from "@/lib/validation/measurement";
import { deleteItem, updateItem } from "@/lib/services/measurement.service";

export const PATCH = withApi(async (req, ctx) => {
  const user = await requireAction("medicao:editar");
  const { id, tipo, itemId } = await ctx.params;
  const kind = itemKindSchema.parse(tipo);
  const body = await readJson(req);
  const data =
    kind === "mao-de-obra" ? laborItemSchema.parse(body) : equipmentItemSchema.parse(body);
  const result = await updateItem(
    getScope(user),
    idSchema.parse(id),
    kind,
    idSchema.parse(itemId),
    data,
    actorFromRequest(user, req),
  );
  return NextResponse.json(result);
});

export const DELETE = withApi(async (req, ctx) => {
  const user = await requireAction("medicao:editar");
  const { id, tipo, itemId } = await ctx.params;
  const kind = itemKindSchema.parse(tipo);
  const result = await deleteItem(
    getScope(user),
    idSchema.parse(id),
    kind,
    idSchema.parse(itemId),
    actorFromRequest(user, req),
  );
  return NextResponse.json(result);
});
