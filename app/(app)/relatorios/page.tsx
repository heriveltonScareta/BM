import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoSemPermissao } from "@/components/estados";
import { RelatorioView } from "@/components/relatorios/relatorio-view";
import { can, getScope, requireSession } from "@/lib/auth/session";
import { getReport, listCompetences } from "@/lib/services/report.service";
import { getClientOptions } from "@/lib/services/client.service";
import { reportFiltersSchema, REPORT_TYPES, type ReportType } from "@/lib/validation/report";

export const metadata: Metadata = { title: "Relatórios" };

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSession();
  if (!can(user, "relatorios:ver")) return <EstadoSemPermissao />;
  const financeiro = can(user, "relatorios:financeiro");
  const tiposPermitidos: ReportType[] = financeiro ? [...REPORT_TYPES] : ["medicoes"];
  const raw = await searchParams;
  const parsed = reportFiltersSchema.safeParse(raw);
  const f = parsed.success ? parsed.data : reportFiltersSchema.parse({});
  if (!tiposPermitidos.includes(f.tipo)) {
    return (
      <EstadoSemPermissao descricao="Relatório disponível apenas para Administrador e Financeiro." />
    );
  }
  const scope = getScope(user);
  const [resultado, competences, clientes] = await Promise.all([
    getReport(scope, f),
    listCompetences(scope),
    getClientOptions(scope),
  ]);

  return (
    <>
      <PageHeader
        titulo="Relatórios"
        descricao="Relatórios de medições, financeiro e faturamento, com filtros combinados e exportação."
      />
      <RelatorioView
        tipo={f.tipo}
        tiposPermitidos={tiposPermitidos}
        resultado={resultado}
        competences={competences}
        clientes={clientes.map((c) => ({ id: c.id, tradeName: c.tradeName }))}
        sort={f.sort}
        order={f.order}
        filtrado={!!(f.de || f.ate || f.clientId || f.statuses?.length)}
      />
    </>
  );
}
