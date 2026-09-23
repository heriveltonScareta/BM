import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoSemPermissao } from "@/components/estados";
import { ClienteForm } from "@/components/clientes/cliente-form";
import { can, requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Novo cliente" };

export default async function NovoClientePage() {
  const user = await requireSession();
  if (!can(user, "clientes:gerenciar")) return <EstadoSemPermissao />;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        titulo="Novo cliente"
        descricao="Cadastre a empresa. Contatos e contratos são adicionados em seguida."
      />
      <ClienteForm />
    </div>
  );
}
