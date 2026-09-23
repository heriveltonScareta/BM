import { NextResponse } from "next/server";
import { withApi, readJson, actorFromRequest } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import {
  equipmentItemSchema,
  itemKindSchema,
  laborItemSchema,
  reorderSchema,
} from "@/lib/validation/measurement";
import { addItem, reorderItems } from "@/lib/services/measurement.service";

export const POST = withApi(async (req, ctx) => {
  const user = await requireAction("medicao:editar");
  const { id, tipo } = await ctx.params;
  const kind = itemKindSchema.parse(tipo);
  const body = await readJson(req);
  const data =
    kind === "mao-de-obra" ? laborItemSchema.parse(body) : equipmentItemSchema.parse(body);
  const result = await addItem(
    getScope(user),
    idSchema.parse(id),
    kind,
    data,
    actorFromRequest(user, req),
  );
  return NextResponse.json(result, { status: 201 });
});

export const PATCH = withApi(async (req, ctx) => {
  const user = await requireAction("medicao:editar");
  const { id, tipo } = await ctx.params;
  const kind = itemKindSchema.parse(tipo);
  const { ids } = reorderSchema.parse(await readJson(req));
  return NextResponse.json(
    await reorderItems(getScope(user), idSchema.parse(id), kind, ids, actorFromRequest(user, req)),
  );
});
