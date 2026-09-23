import Link from "next/link";
import { AlertTriangle, Clock, Receipt, Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EstadoVazio } from "@/components/estados";
import type { DashboardData } from "@/lib/services/report.service";

const ICONES = {
  CORRECAO: AlertTriangle,
  LINK_EXPIRADO: Clock,
  NF_DIVERGENTE: Receipt,
  AGUARDANDO_ENVIO: Send,
} as const;

const CORES = {
  CORRECAO: "text-status-amber",
  LINK_EXPIRADO: "text-status-red",
  NF_DIVERGENTE: "text-status-amber",
  AGUARDANDO_ENVIO: "text-status-blue",
} as const;

export function PendenciasLista({ pendencias }: { pendencias: DashboardData["pendencias"] }) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Pendências</CardTitle>
        <CardDescription>
          Correções solicitadas, links expirados, notas divergentes e medições prontas para envio.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pendencias.length === 0 ? (
          <EstadoVazio titulo="Nenhuma pendência" className="py-8" />
        ) : (
          <ul className="divide-y text-sm" aria-label="Pendências">
            {pendencias.map((p) => {
              const Icone = ICONES[p.tipo];
              return (
                <li key={`${p.tipo}-${p.id}`}>
                  <Link
                    href={`/medicoes/${p.id}`}
                    className="flex items-start gap-3 py-2 hover:bg-muted/40"
                  >
                    <Icone className={`mt-0.5 size-4 shrink-0 ${CORES[p.tipo]}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-mono text-xs">{p.number}</span>
                        <span className="truncate text-muted-foreground">{p.cliente}</span>
                      </div>
                      <div>{p.descricao}</div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
