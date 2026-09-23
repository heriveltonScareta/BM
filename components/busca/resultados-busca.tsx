import Link from "next/link";
import { Building2, FileSignature, FileText, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EstadoVazio } from "@/components/estados";
import { StatusBadge } from "@/components/medicao/status-badge";
import type { SearchResults } from "@/lib/services/report.service";
import { formatCnpj } from "@/lib/validation/cnpj";
import { formatCurrency } from "@/lib/utils/format";
import { formatCompetence } from "@/lib/utils/dates";

function Grupo({
  titulo,
  quantidade,
  icone: Icone,
  children,
}: {
  titulo: string;
  quantidade: number;
  icone: typeof FileText;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-3" data-testid={`grupo-${titulo.toLowerCase().replace(/\s/g, "-")}`}>
      <CardHeader className="flex flex-row items-center gap-2">
        <Icone className="size-4 text-muted-foreground" aria-hidden />
        <CardTitle>
          {titulo} <span className="font-normal text-muted-foreground tabular">({quantidade})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {quantidade === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum resultado.</p>
        ) : (
          <ul className="divide-y text-sm">{children}</ul>
        )}
      </CardContent>
    </Card>
  );
}

const item = "flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 hover:bg-muted/40";

export function ResultadosBusca({
  r,
  mostrarClientes,
}: {
  r: SearchResults;
  mostrarClientes: boolean;
}) {
  const total = r.clientes.length + r.contratos.length + r.medicoes.length + r.notasFiscais.length;
  if (total === 0) {
    return (
      <EstadoVazio
        titulo={`Nada encontrado para “${r.q}”`}
        descricao="Tente o número do boletim (BM-AAAA-NNNN), FRS, pedido de compra, número da NF, código do contrato ou nome do cliente."
      />
    );
  }
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Grupo titulo="Medições" quantidade={r.medicoes.length} icone={FileText}>
        {r.medicoes.map((m) => (
          <li key={m.id}>
            <Link href={`/medicoes/${m.id}`} className={item}>
              <span className="font-mono text-xs">{m.number}</span>
              <span className="font-medium">{m.cliente}</span>
              <span className="text-muted-foreground tabular">
                {formatCompetence(m.competence)}
              </span>
              <StatusBadge status={m.status} />
              <span className="ml-auto tabular">{formatCurrency(m.totalAmount)}</span>
              <span className="basis-full text-xs text-muted-foreground">
                Encontrado por: {m.match}
              </span>
            </Link>
          </li>
        ))}
      </Grupo>
      <Grupo titulo="Notas fiscais" quantidade={r.notasFiscais.length} icone={Receipt}>
        {r.notasFiscais.map((n) => (
          <li key={`${n.measurementId}-${n.number}`}>
            <Link href={`/medicoes/${n.measurementId}?aba=faturamento`} className={item}>
              <span className="font-medium">NF {n.number}</span>
              <span className="font-mono text-xs">{n.measurementNumber}</span>
              <span className="text-muted-foreground">{n.cliente}</span>
              <span className="ml-auto tabular">{formatCurrency(n.amount)}</span>
            </Link>
          </li>
        ))}
      </Grupo>
      {mostrarClientes ? (
        <>
          <Grupo titulo="Clientes" quantidade={r.clientes.length} icone={Building2}>
            {r.clientes.map((c) => (
              <li key={c.id}>
                <Link href={`/clientes/${c.id}`} className={item}>
                  <span className="font-mono text-xs">{c.code}</span>
                  <span className="font-medium">{c.tradeName}</span>
                  <span className="text-muted-foreground">{c.legalName}</span>
                  <span className="ml-auto text-xs text-muted-foreground tabular">
                    {formatCnpj(c.cnpj)}
                  </span>
                </Link>
              </li>
            ))}
          </Grupo>
          <Grupo titulo="Contratos" quantidade={r.contratos.length} icone={FileSignature}>
            {r.contratos.map((c) => (
              <li key={c.id}>
                <Link href={`/clientes/${c.clientId}`} className={item}>
                  <span className="font-mono text-xs">{c.code}</span>
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground">{c.cliente}</span>
                </Link>
              </li>
            ))}
          </Grupo>
        </>
      ) : null}
    </div>
  );
}
