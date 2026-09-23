import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoSemPermissao, EstadoVazio } from "@/components/estados";
import { can } from "@/lib/auth/rbac";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Boletins de Medição" };

export default async function Page() {
  const user = await requireSession();
  if (!can(user, "medicao:ver")) return <EstadoSemPermissao />;
  return (
    <>
      <PageHeader
        titulo="Boletins de Medição"
        descricao="Todas as medições, por status e competência."
      />
      <EstadoVazio
        titulo="Nada por aqui ainda"
        descricao="A listagem de medições será entregue na Fase 2."
      />
    </>
  );
}
