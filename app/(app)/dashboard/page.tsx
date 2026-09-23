import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoSemPermissao, EstadoVazio } from "@/components/estados";
import { can } from "@/lib/auth/rbac";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Page() {
  const user = await requireSession();
  if (!can(user, "medicao:ver")) return <EstadoSemPermissao />;
  return (
    <>
      <PageHeader titulo="Dashboard" descricao="Visão geral das medições e do faturamento." />
      <EstadoVazio
        titulo="Nada por aqui ainda"
        descricao="Os indicadores serão exibidos aqui a partir da Fase 6."
      />
    </>
  );
}
