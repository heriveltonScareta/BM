import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoSemPermissao, EstadoVazio } from "@/components/estados";
import { can } from "@/lib/auth/rbac";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Aprovações" };

export default async function Page() {
  const user = await requireSession();
  if (!can(user, "medicao:ver")) return <EstadoSemPermissao />;
  return (
    <>
      <PageHeader
        titulo="Aprovações"
        descricao="Medições enviadas ao cliente e aguardando decisão."
      />
      <EstadoVazio
        titulo="Nada por aqui ainda"
        descricao="O fluxo de aprovação será entregue na Fase 4."
      />
    </>
  );
}
