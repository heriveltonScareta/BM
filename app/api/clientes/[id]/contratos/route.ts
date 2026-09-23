import { NextResponse } from "next/server";
import { withApi, readJson, actorFromRequest } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { contractSchema } from "@/lib/validation/client";
import { idSchema } from "@/lib/validation/common";
import { createContract } from "@/lib/services/client.service";

export const POST = withApi(async (req, ctx) => {
  const user = await requireAction("clientes:gerenciar");
  const { id } = await ctx.params;
  const data = contractSchema.parse(await readJson(req));
  const contract = await createContract(
    getScope(user),
    idSchema.parse(id),
    data,
    actorFromRequest(user, req),
  );
  return NextResponse.json(contract, { status: 201 });
});
