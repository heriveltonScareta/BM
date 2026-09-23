import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoSemPermissao } from "@/components/estados";
import { BuscaUrl, SelectUrl } from "@/components/tabelas/filtros";
import { DocumentosTabela } from "@/components/documentos/documentos-tabela";
import { can, getScope, requireSession } from "@/lib/auth/session";
import { listDocuments } from "@/lib/services/document.service";
import { getClientsForSelection } from "@/lib/services/client.service";
import { documentListQuerySchema, DOCUMENT_TYPE_LABELS } from "@/lib/validation/invoice";
import { DocumentType } from "@/lib/db/generated/enums";

export const metadata: Metadata = { title: "Documentos" };

export default async function DocumentosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSession();
  if (!can(user, "documentos:ver")) return <EstadoSemPermissao />;
  const scope = getScope(user);
  const parsed = documentListQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : documentListQuerySchema.parse({});
  const [result, clientes] = await Promise.all([
    listDocuments(scope, query),
    user.role === "CLIENTE" ? Promise.resolve([]) : getClientsForSelection(scope),
  ]);

  return (
    <>
      <PageHeader
        titulo="Documentos"
        descricao="Boletins, boletins assinados, notas fiscais e anexos, por medição."
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <BuscaUrl placeholder="Arquivo, número da medição ou cliente…" />
        <SelectUrl
          param="type"
          label="Tipo"
          defaultValue="todos"
          options={[
            { value: "todos", label: "Todos os tipos" },
            ...Object.values(DocumentType).map((t) => ({
              value: t,
              label: DOCUMENT_TYPE_LABELS[t],
            })),
          ]}
        />
        {clientes.length ? (
          <SelectUrl
            param="clientId"
            label="Cliente"
            defaultValue="todos"
            options={[
              { value: "todos", label: "Todos os clientes" },
              ...clientes.map((c) => ({ value: c.id, label: c.tradeName })),
            ]}
          />
        ) : null}
      </div>
      <DocumentosTabela
        data={result.items.map((d) => ({
          id: d.id,
          type: d.type,
          fileName: d.fileName,
          sizeBytes: d.sizeBytes,
          createdAt: d.createdAt.toISOString(),
          measurement: d.measurement,
          client: d.client,
          uploadedBy: d.uploadedBy?.name ?? null,
        }))}
        pagination={{
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages,
        }}
        sort={query.sort}
        order={query.order}
        filtrado={!!query.q || !!query.type || !!query.clientId}
      />
    </>
  );
}
