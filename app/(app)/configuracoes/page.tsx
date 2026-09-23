import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoSemPermissao, EstadoVazio } from "@/components/estados";
import { can } from "@/lib/auth/rbac";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Configurações" };

export default async function Page() {
  const user = await requireSession();
  if (!can(user, "configuracoes:ver")) return <EstadoSemPermissao />;
  return (
    <>
      <PageHeader titulo="Configurações" descricao="Usuários, dados da empresa e auditoria." />
      <EstadoVazio
        titulo="Nada por aqui ainda"
        descricao="As configurações serão entregues nas próximas fases."
      />
    </>
  );
}
