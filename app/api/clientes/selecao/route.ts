import { NextResponse } from "next/server";
import { withApi } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { getClientsForSelection } from "@/lib/services/client.service";

/** Clientes ativos (com contratos ativos e aprovadores) para o formulario de medicao. */
export const GET = withApi(async () => {
  const user = await requireAction("medicao:criar");
  return NextResponse.json(await getClientsForSelection(getScope(user)));
});
