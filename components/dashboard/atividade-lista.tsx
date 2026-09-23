import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EstadoVazio } from "@/components/estados";
import { AUDIT_ACTION_LABELS } from "@/components/medicao/timeline";
import type { AuditAction } from "@/lib/services/audit.service";
import type { DashboardData } from "@/lib/services/report.service";
import { formatDateTime } from "@/lib/utils/dates";

export function AtividadeLista({ atividade }: { atividade: DashboardData["atividade"] }) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Atividade recente</CardTitle>
        <CardDescription>Últimos eventos registrados na auditoria.</CardDescription>
      </CardHeader>
      <CardContent>
        {atividade.length === 0 ? (
          <EstadoVazio titulo="Nenhuma atividade ainda" className="py-8" />
        ) : (
          <ol className="divide-y text-sm" aria-label="Atividade recente">
            {atividade.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 py-2">
                <span className="text-xs text-muted-foreground tabular">
                  {formatDateTime(a.createdAt)}
                </span>
                <span className="font-medium">
                  {AUDIT_ACTION_LABELS[a.action as AuditAction] ?? a.action}
                </span>
                {a.measurementId && a.number ? (
                  <Link
                    href={`/medicoes/${a.measurementId}`}
                    className="font-mono text-xs underline"
                  >
                    {a.number}
                  </Link>
                ) : null}
                <span className="text-muted-foreground">por {a.actorLabel}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
