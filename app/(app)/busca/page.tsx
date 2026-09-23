import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/estados";
import { ResultadosBusca } from "@/components/busca/resultados-busca";
import { can, getScope, requireSession } from "@/lib/auth/session";
import { globalSearch } from "@/lib/services/report.service";
import { searchQuerySchema } from "@/lib/validation/report";

export const metadata: Metadata = { title: "Busca" };

export default async function BuscaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSession();
  const parsed = searchQuerySchema.safeParse(await searchParams);
  if (!parsed.success) {
    return (
      <>
        <PageHeader
          titulo="Busca"
          descricao="Localize boletins, notas fiscais, contratos e clientes."
        />
        <EstadoVazio
          titulo="Digite ao menos 2 caracteres"
          descricao="Use o campo de busca no topo da tela."
        />
      </>
    );
  }
  const r = await globalSearch(user, getScope(user), parsed.data.q);
  return (
    <>
      <PageHeader
        titulo={`Resultados para “${r.q}”`}
        descricao="Somente registros do seu escopo são exibidos."
      />
      <ResultadosBusca r={r} mostrarClientes={can(user, "clientes:ver")} />
    </>
  );
}
