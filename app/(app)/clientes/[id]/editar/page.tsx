import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoSemPermissao } from "@/components/estados";
import { ClienteForm } from "@/components/clientes/cliente-form";
import { can, getScope, requireSession } from "@/lib/auth/session";
import { getClient } from "@/lib/services/client.service";
import { NotFoundError } from "@/lib/errors";
import { idSchema } from "@/lib/validation/common";

export const metadata: Metadata = { title: "Editar cliente" };

export default async function EditarClientePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession();
  if (!can(user, "clientes:gerenciar")) return <EstadoSemPermissao />;
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  let cliente;
  try {
    cliente = await getClient(getScope(user), id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader titulo={`Editar ${cliente.tradeName}`} descricao={cliente.code} />
      <ClienteForm cliente={cliente} />
    </div>
  );
}
