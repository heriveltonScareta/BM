import { NextResponse } from "next/server";
import { withApi, readJson, actorFromRequest } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { clientStatusSchema } from "@/lib/validation/client";
import { idSchema } from "@/lib/validation/common";
import { setClientActive } from "@/lib/services/client.service";

export const PATCH = withApi(async (req, ctx) => {
  const user = await requireAction("clientes:gerenciar");
  const { id } = await ctx.params;
  const { isActive } = clientStatusSchema.parse(await readJson(req));
  const client = await setClientActive(
    getScope(user),
    idSchema.parse(id),
    isActive,
    actorFromRequest(user, req),
  );
  return NextResponse.json(client);
});
