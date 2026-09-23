import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/medicao/status-badge";
import type { ClientSummary } from "@/lib/services/report.service";
import { formatCurrency } from "@/lib/utils/format";
import { formatCompetence, formatDateTime } from "@/lib/utils/dates";

/** Visao individual do cliente: medicoes por status e as mais recentes. */
export function MedicoesResumoCard({
  clienteId,
  resumo,
  mostrarValores,
}: {
  clienteId: string;
  resumo: ClientSummary;
  mostrarValores: boolean;
}) {
  return (
    <Card className="gap-4" data-testid="resumo-medicoes">
      <CardHeader>
        <CardTitle>Medições</CardTitle>
        <CardDescription>
          {resumo.total.quantidade}{" "}
          {resumo.total.quantidade === 1 ? "medição ativa" : "medições ativas"}
          {mostrarValores ? ` · ${formatCurrency(resumo.total.valor)}` : ""} · faturado:{" "}
          {resumo.faturado.quantidade}
          {mostrarValores ? ` (${formatCurrency(resumo.faturado.valor)})` : ""}
        </CardDescription>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <Link href={`/medicoes?clientId=${clienteId}`}>
              Ver todas <ArrowRight aria-hidden />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase">Por status</h3>
          {resumo.porStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma medição para este cliente.</p>
          ) : (
            <ul className="divide-y text-sm">
              {resumo.porStatus.map((s) => (
                <li key={s.status} className="flex items-center gap-3 py-1.5">
                  <StatusBadge status={s.status} />
                  <span className="ml-auto tabular">{s.quantidade}</span>
                  {mostrarValores ? (
                    <span className="w-32 text-right text-muted-foreground tabular">
                      {formatCurrency(s.valor)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase">
            Mais recentes
          </h3>
          {resumo.ultimas.length === 0 ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <ul className="divide-y text-sm">
              {resumo.ultimas.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/medicoes/${m.id}`}
                    className="flex flex-wrap items-center gap-x-3 py-1.5 hover:bg-muted/40"
                  >
                    <span className="font-mono text-xs">{m.number}</span>
                    <span className="text-muted-foreground tabular">
                      {formatCompetence(m.competence)}
                    </span>
                    <StatusBadge status={m.status} />
                    <span className="ml-auto tabular">{formatCurrency(m.totalAmount)}</span>
                    <span className="basis-full text-xs text-muted-foreground">
                      Atualizada em {formatDateTime(m.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
