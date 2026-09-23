import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoSemPermissao } from "@/components/estados";
import { NovaMedicaoForm } from "@/components/medicao/nova-medicao-form";
import { can, requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Nova Medição" };

export default async function NovaMedicaoPage() {
  const user = await requireSession();
  if (!can(user, "medicao:criar")) return <EstadoSemPermissao />;
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        titulo="Nova Medição"
        descricao="O número do boletim é gerado automaticamente ao salvar. Itens são adicionados em seguida."
      />
      <NovaMedicaoForm />
    </div>
  );
}
