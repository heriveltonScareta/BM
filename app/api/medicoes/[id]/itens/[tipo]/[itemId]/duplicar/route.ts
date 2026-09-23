import { NextResponse } from "next/server";
import { withApi, actorFromRequest } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import { itemKindSchema } from "@/lib/validation/measurement";
import { duplicateItem } from "@/lib/services/measurement.service";

export const POST = withApi(async (req, ctx) => {
  const user = await requireAction("medicao:editar");
  const { id, tipo, itemId } = await ctx.params;
  const kind = itemKindSchema.parse(tipo);
  const result = await duplicateItem(
    getScope(user),
    idSchema.parse(id),
    kind,
    idSchema.parse(itemId),
    actorFromRequest(user, req),
  );
  return NextResponse.json(result, { status: 201 });
});
