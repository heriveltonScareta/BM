import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoSemPermissao, EstadoVazio } from "@/components/estados";
import { can } from "@/lib/auth/rbac";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Nova Medição" };

export default async function Page() {
  const user = await requireSession();
  if (!can(user, "medicao:criar")) return <EstadoSemPermissao />;
  return (
    <>
      <PageHeader titulo="Nova Medição" descricao="Crie um novo boletim de medição." />
      <EstadoVazio
        titulo="Nada por aqui ainda"
        descricao="A criação de medição será entregue na Fase 2."
      />
    </>
  );
}
