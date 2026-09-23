import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoSemPermissao } from "@/components/estados";
import { BuscaUrl, SelectUrl } from "@/components/tabelas/filtros";
import { MedicoesTabela } from "@/components/medicao/medicoes-tabela";
import { can, getScope, requireSession } from "@/lib/auth/session";
import { getMeasurements } from "@/lib/services/measurement.service";
import { toMeasurementListRow } from "@/lib/services/measurement-dto";
import { getClientsForSelection } from "@/lib/services/client.service";
import { measurementListQuerySchema } from "@/lib/validation/measurement";
import { MeasurementStatus as S } from "@/lib/db/generated/enums";
import { STATUS_LABELS } from "@/lib/services/status-machine";

export const metadata: Metadata = { title: "Faturamento" };

const FILA: S[] = [S.ASSINADO, S.LIBERADO_FATURAMENTO, S.NF_ANEXADA, S.FATURADO];

export default async function FaturamentoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSession();
  if (!can(user, "faturamento:gerenciar")) return <EstadoSemPermissao />;
  const scope = getScope(user);
  const raw = await searchParams;
  const parsed = measurementListQuerySchema.safeParse({ sort: "updatedAt", order: "desc", ...raw });
  const query = parsed.success ? parsed.data : measurementListQuerySchema.parse({});
  const status = query.status && FILA.includes(query.status) ? query.status : undefined;
  const [result, clientes] = await Promise.all([
    getMeasurements(scope, { ...query, status, statuses: status ? undefined : FILA }),
    getClientsForSelection(scope),
  ]);

  return (
    <>
      <PageHeader
        titulo="Faturamento"
        descricao="Medições assinadas: liberação, nota fiscal e conclusão do faturamento."
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <BuscaUrl placeholder="Número, FRS, PC, cliente…" />
        <SelectUrl
          param="status"
          label="Etapa"
          defaultValue="todos"
          options={[
            { value: "todos", label: "Todas as etapas" },
            ...FILA.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
          ]}
        />
        <SelectUrl
          param="clientId"
          label="Cliente"
          defaultValue="todos"
          options={[
            { value: "todos", label: "Todos os clientes" },
            ...clientes.map((c) => ({ value: c.id, label: c.tradeName })),
          ]}
        />
      </div>
      <MedicoesTabela
        mostrarNf
        data={result.items.map(toMeasurementListRow)}
        pagination={{
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages,
        }}
        sort={query.sort}
        order={query.order}
        podeCriar={false}
        filtrado={!!query.q || !!status || !!query.clientId}
      />
    </>
  );
}
