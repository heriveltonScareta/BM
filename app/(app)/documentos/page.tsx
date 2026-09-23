import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoSemPermissao, EstadoVazio } from "@/components/estados";
import { can } from "@/lib/auth/rbac";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Documentos" };

export default async function Page() {
  const user = await requireSession();
  if (!can(user, "documentos:ver")) return <EstadoSemPermissao />;
  return (
    <>
      <PageHeader titulo="Documentos" descricao="Boletins, boletins assinados e notas fiscais." />
      <EstadoVazio
        titulo="Nada por aqui ainda"
        descricao="A área de documentos será entregue na Fase 5."
      />
    </>
  );
}
