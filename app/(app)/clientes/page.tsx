import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoSemPermissao, EstadoVazio } from "@/components/estados";
import { can } from "@/lib/auth/rbac";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Clientes" };

export default async function Page() {
  const user = await requireSession();
  if (!can(user, "clientes:ver")) return <EstadoSemPermissao />;
  return (
    <>
      <PageHeader titulo="Clientes" descricao="Cadastro de clientes, contatos e contratos." />
      <EstadoVazio
        titulo="Nada por aqui ainda"
        descricao="O cadastro de clientes será entregue na Fase 1."
      />
    </>
  );
}
