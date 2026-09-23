import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoSemPermissao } from "@/components/estados";
import { BuscaUrl, SelectUrl } from "@/components/tabelas/filtros";
import { MedicoesTabela } from "@/components/medicao/medicoes-tabela";
import { can, getScope, requireSession } from "@/lib/auth/session";
import { getMeasurements } from "@/lib/services/measurement.service";
import { toMeasurementListRow } from "@/lib/services/measurement-dto";
import { measurementListQuerySchema } from "@/lib/validation/measurement";
import { MeasurementStatus as S } from "@/lib/db/generated/enums";
import { STATUS_LABELS } from "@/lib/services/status-machine";

export const metadata: Metadata = { title: "Aprovações" };

const FILA: S[] = [S.ENVIADO_AO_CLIENTE, S.EM_APROVACAO, S.CORRECAO_SOLICITADA, S.APROVADO];

export default async function AprovacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSession();
  if (!can(user, "medicao:ver")) return <EstadoSemPermissao />;
  const raw = await searchParams;
  const parsed = measurementListQuerySchema.safeParse({ sort: "updatedAt", order: "desc", ...raw });
  const query = parsed.success ? parsed.data : measurementListQuerySchema.parse({});
  const status = query.status && FILA.includes(query.status) ? query.status : undefined;
  const result = await getMeasurements(getScope(user), {
    ...query,
    status,
    statuses: status ? undefined : FILA,
  });

  return (
    <>
      <PageHeader
        titulo="Aprovações"
        descricao="Medições enviadas ao cliente: aguardando abertura, decisão ou assinatura, e correções solicitadas."
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
      </div>
      <MedicoesTabela
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
        filtrado={!!query.q || !!status}
      />
    </>
  );
}
