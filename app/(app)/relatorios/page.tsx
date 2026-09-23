import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoSemPermissao, EstadoVazio } from "@/components/estados";
import { can } from "@/lib/auth/rbac";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Relatórios" };

export default async function Page() {
  const user = await requireSession();
  if (!can(user, "relatorios:ver")) return <EstadoSemPermissao />;
  return (
    <>
      <PageHeader
        titulo="Relatórios"
        descricao="Relatórios de medições, financeiro e faturamento."
      />
      <EstadoVazio
        titulo="Nada por aqui ainda"
        descricao="Os relatórios serão entregues na Fase 6."
      />
    </>
  );
}
