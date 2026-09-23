import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoSemPermissao } from "@/components/estados";
import { BuscaUrl, SelectUrl } from "@/components/tabelas/filtros";
import { ClientesTabela } from "@/components/clientes/clientes-tabela";
import { can, getScope, requireSession } from "@/lib/auth/session";
import { getClients } from "@/lib/services/client.service";
import { clientListQuerySchema } from "@/lib/validation/client";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSession();
  if (!can(user, "clientes:ver")) return <EstadoSemPermissao />;

  const raw = await searchParams;
  const parsed = clientListQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : clientListQuerySchema.parse({});
  const result = await getClients(getScope(user), query);
  const podeCriar = can(user, "clientes:gerenciar");

  return (
    <>
      <PageHeader
        titulo="Clientes"
        descricao="Cadastro de clientes, contatos aprovadores e contratos."
        acoes={
          podeCriar ? (
            <Button asChild>
              <Link href="/clientes/novo">
                <Plus aria-hidden /> Novo cliente
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <BuscaUrl placeholder="Buscar por nome, código ou CNPJ…" />
        <SelectUrl
          param="status"
          label="Situação"
          defaultValue="todos"
          options={[
            { value: "todos", label: "Todos" },
            { value: "ativos", label: "Ativos" },
            { value: "inativos", label: "Inativos" },
          ]}
        />
      </div>
      <ClientesTabela
        data={result.items}
        pagination={{
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages,
        }}
        sort={query.sort}
        order={query.order}
        podeCriar={podeCriar}
        filtrado={!!query.q || query.status !== "todos"}
      />
    </>
  );
}
