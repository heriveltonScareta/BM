import { withApi, actorFromRequest } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import { removeDocument } from "@/lib/services/document.service";

export const DELETE = withApi(async (req, ctx) => {
  const user = await requireAction("documentos:upload");
  const { id } = await ctx.params;
  await removeDocument(getScope(user), idSchema.parse(id), actorFromRequest(user, req));
  return new Response(null, { status: 204 });
});
