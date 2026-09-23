import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, Clock, FileEdit, Receipt, Send } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoSemPermissao } from "@/components/estados";
import { SelectUrl } from "@/components/tabelas/filtros";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PendenciasLista } from "@/components/dashboard/pendencias-lista";
import { AtividadeLista } from "@/components/dashboard/atividade-lista";
import { GraficoBarras } from "@/components/graficos/grafico-barras";
import { can, getScope, requireSession } from "@/lib/auth/session";
import { getDashboard } from "@/lib/services/report.service";
import { STATUS_TONES } from "@/lib/services/status-machine";
import { dashboardQuerySchema } from "@/lib/validation/report";
import { competenceLabel, formatCompetence } from "@/lib/utils/dates";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSession();
  if (!can(user, "medicao:ver")) return <EstadoSemPermissao />;
  const parsed = dashboardQuerySchema.safeParse(await searchParams);
  const competence = parsed.success ? parsed.data.competence : undefined;
  // Valores consolidados: Admin e Financeiro; o Cliente ve as somas das proprias medicoes.
  const financeiro = can(user, "relatorios:financeiro") || user.role === "CLIENTE";
  const d = await getDashboard(getScope(user), { competence });
  const valor = (v: string) => (financeiro ? v : null);
  const periodo = competence ? competenceLabel(competence) : "todas as competências";
  const sufixo = competence ? `&competence=${competence}` : "";
  const filtroCompetencia = competence ? `?competence=${competence}` : "";

  return (
    <>
      <PageHeader
        titulo="Dashboard"
        descricao={`Visão geral das medições e do faturamento · ${periodo}.`}
        acoes={
          <SelectUrl
            param="competence"
            label="Competência"
            defaultValue="todas"
            options={[
              { value: "todas", label: "Todas as competências" },
              ...d.competences.map((c) => ({ value: c, label: formatCompetence(c) })),
            ]}
          />
        }
      />

      <section aria-label="Indicadores" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          titulo="Em elaboração"
          quantidade={d.cards.emElaboracao.quantidade}
          valor={valor(d.cards.emElaboracao.valor)}
          icone={FileEdit}
          href={`/medicoes${filtroCompetencia}`}
        />
        <KpiCard
          titulo="Aguardando cliente"
          quantidade={d.cards.aguardandoCliente.quantidade}
          valor={valor(d.cards.aguardandoCliente.valor)}
          icone={Send}
          href={`/aprovacoes${filtroCompetencia}`}
        />
        <KpiCard
          titulo="Aprovadas não faturadas"
          quantidade={d.cards.aprovadasNaoFaturadas.quantidade}
          valor={valor(d.cards.aprovadasNaoFaturadas.valor)}
          icone={CheckCircle2}
          href={can(user, "faturamento:gerenciar") ? `/faturamento${filtroCompetencia}` : undefined}
        />
        <KpiCard
          titulo="Faturadas"
          quantidade={d.cards.faturadas.quantidade}
          valor={valor(d.cards.faturadas.valor)}
          icone={Receipt}
          href={`/medicoes?status=FATURADO${sufixo}`}
        />
      </section>

      <section aria-label="Alertas" className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          titulo="Correções solicitadas"
          quantidade={d.cards.correcaoSolicitada}
          icone={AlertTriangle}
          destaque="amber"
          href={`/medicoes?status=CORRECAO_SOLICITADA${sufixo}`}
        />
        <KpiCard
          titulo="Links de aprovação expirados"
          quantidade={d.cards.linksExpirados}
          icone={Clock}
          destaque="red"
          href={`/aprovacoes${filtroCompetencia}`}
        />
        <KpiCard
          titulo="Notas fiscais divergentes"
          quantidade={d.cards.nfDivergente}
          icone={Receipt}
          destaque="amber"
          href={can(user, "faturamento:gerenciar") ? `/faturamento${filtroCompetencia}` : undefined}
        />
      </section>

      <section aria-label="Gráficos" className="grid gap-4 xl:grid-cols-2">
        <GraficoBarras
          titulo={financeiro ? "Faturado por competência" : "Medições faturadas por competência"}
          descricao={
            financeiro
              ? "Soma das medições com status Faturado, últimas 6 competências."
              : "Quantidade de medições com status Faturado, últimas 6 competências."
          }
          medida={financeiro ? "valor" : "quantidade"}
          mostrarValor={financeiro}
          dados={d.faturadoPorCompetencia.map((r) => ({
            chave: r.competence,
            label: formatCompetence(r.competence),
            valor: r.valor,
            quantidade: r.quantidade,
          }))}
          vazio="Nenhuma medição faturada ainda."
        />
        <GraficoBarras
          titulo="Medições por status"
          descricao={`Quantidade por status · ${periodo}.`}
          medida="quantidade"
          orientacao="horizontal"
          mostrarValor={financeiro}
          dados={d.porStatus
            .filter((s) => s.quantidade > 0)
            .map((s) => ({
              chave: s.status,
              label: s.label,
              valor: s.valor,
              quantidade: s.quantidade,
              tone: STATUS_TONES[s.status],
            }))}
          vazio="Nenhuma medição no período."
        />
        {user.role !== "CLIENTE" ? (
          <GraficoBarras
            className="xl:col-span-2"
            titulo={financeiro ? "Valor por cliente" : "Medições por cliente"}
            descricao={
              financeiro
                ? `Soma das medições não canceladas por cliente (até 8) · ${periodo}.`
                : `Quantidade de medições não canceladas por cliente (até 8) · ${periodo}.`
            }
            medida={financeiro ? "valor" : "quantidade"}
            orientacao="horizontal"
            mostrarValor={financeiro}
            dados={d.valorPorCliente.map((r) => ({
              chave: r.clientId,
              label: r.cliente,
              valor: r.valor,
              quantidade: r.quantidade,
            }))}
            vazio="Nenhuma medição no período."
          />
        ) : null}
      </section>

      <section aria-label="Pendências e atividade" className="grid gap-4 xl:grid-cols-2">
        <PendenciasLista pendencias={d.pendencias} />
        <AtividadeLista atividade={d.atividade} />
      </section>
    </>
  );
}
