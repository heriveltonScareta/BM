import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoSemPermissao, EstadoVazio } from "@/components/estados";
import { can } from "@/lib/auth/rbac";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Faturamento" };

export default async function Page() {
  const user = await requireSession();
  if (!can(user, "faturamento:gerenciar")) return <EstadoSemPermissao />;
  return (
    <>
      <PageHeader
        titulo="Faturamento"
        descricao="Liberação, notas fiscais e status de faturamento."
      />
      <EstadoVazio
        titulo="Nada por aqui ainda"
        descricao="O faturamento será entregue na Fase 5."
      />
    </>
  );
}
