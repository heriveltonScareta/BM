import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoSemPermissao } from "@/components/estados";
import { BuscaUrl, SelectUrl } from "@/components/tabelas/filtros";
import { MedicoesTabela } from "@/components/medicao/medicoes-tabela";
import { can, getScope, requireSession } from "@/lib/auth/session";
import { getMeasurements } from "@/lib/services/measurement.service";
import { toMeasurementListRow } from "@/lib/services/measurement-dto";
import { getClientOptions } from "@/lib/services/client.service";
import { measurementListQuerySchema } from "@/lib/validation/measurement";
import { ALL_STATUSES, STATUS_LABELS } from "@/lib/services/status-machine";

export const metadata: Metadata = { title: "Boletins de Medição" };

export default async function MedicoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSession();
  if (!can(user, "medicao:ver")) return <EstadoSemPermissao />;
  const scope = getScope(user);
  const parsed = measurementListQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : measurementListQuerySchema.parse({});
  const [result, clientes] = await Promise.all([
    getMeasurements(scope, query),
    user.role === "CLIENTE" ? Promise.resolve([]) : getClientOptions(scope),
  ]);
  const podeCriar = can(user, "medicao:criar");

  return (
    <>
      <PageHeader
        titulo="Boletins de Medição"
        descricao="Todas as medições, por status, cliente e competência."
        acoes={
          podeCriar ? (
            <Button asChild>
              <Link href="/medicoes/nova">
                <Plus aria-hidden /> Nova medição
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <BuscaUrl placeholder="Número, FRS, PC, cliente ou contrato…" />
        <SelectUrl
          param="status"
          label="Status"
          defaultValue="todos"
          options={[
            { value: "todos", label: "Todos os status" },
            ...ALL_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
          ]}
        />
        {clientes.length > 0 ? (
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
        podeCriar={podeCriar}
        filtrado={!!query.q || !!query.status || !!query.clientId || !!query.competence}
      />
    </>
  );
}
