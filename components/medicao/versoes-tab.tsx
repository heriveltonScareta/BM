"use client";

import { useState } from "react";
import { FileDown, GitCompare, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EstadoErro, EstadoVazio } from "@/components/estados";
import { api } from "@/lib/api/client";
import type { VersionComparison } from "@/lib/services/version-compare";
import { formatCurrency, formatQuantity } from "@/lib/utils/format";
import { formatDateTime } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

export interface VersaoResumo {
  id: string;
  version: number;
  createdAt: string;
  createdBy: string;
  totalAmount: string;
  laborCount: number;
  equipmentCount: number;
  requests: Array<{
    sentToName: string;
    sentToEmail: string;
    sentAt: string;
    decidedAt: string | null;
    decision: "APPROVED" | "CHANGES_REQUESTED" | null;
    comment: string | null;
  }>;
  signatures: Array<{ signerName: string; signedAt: string }>;
}

export function VersoesTab({
  medicaoId,
  versoes,
  vigente,
}: {
  medicaoId: string;
  versoes: VersaoResumo[];
  vigente: number;
}) {
  const [a, setA] = useState(String(versoes[1]?.version ?? versoes[0]?.version ?? 1));
  const [b, setB] = useState(String(versoes[0]?.version ?? 1));
  const [cmp, setCmp] = useState<VersionComparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(false);

  async function comparar() {
    setBusy(true);
    setErro(false);
    try {
      setCmp(
        await api<VersionComparison>(`/api/medicoes/${medicaoId}/versoes/comparar?a=${a}&b=${b}`),
      );
    } catch {
      setErro(true);
    } finally {
      setBusy(false);
    }
  }

  if (versoes.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhuma versão enviada"
        descricao="Cada envio ao cliente congela uma versão do boletim. Elas aparecem aqui."
        className="py-8"
      />
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-2" aria-label="Versões da medição">
        {versoes.map((v) => {
          const req = v.requests[0];
          const sig = v.signatures[0];
          return (
            <li
              key={v.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-md border bg-card p-3 text-sm"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Versão {v.version}</span>
                  {v.version === vigente ? (
                    <Badge className="bg-primary">Vigente</Badge>
                  ) : (
                    <Badge variant="secondary">Substituída</Badge>
                  )}
                  {sig ? (
                    <Badge
                      variant="outline"
                      className="border-status-green/30 bg-status-green-bg text-status-green"
                    >
                      Assinada
                    </Badge>
                  ) : null}
                  {req?.decision === "CHANGES_REQUESTED" ? (
                    <Badge
                      variant="outline"
                      className="border-status-amber/30 bg-status-amber-bg text-status-amber"
                    >
                      Correção solicitada
                    </Badge>
                  ) : null}
                  {req?.decision === "APPROVED" && !sig ? (
                    <Badge
                      variant="outline"
                      className="border-status-green/30 bg-status-green-bg text-status-green"
                    >
                      Aprovada
                    </Badge>
                  ) : null}
                </div>
                <div className="text-muted-foreground">
                  Congelada em {formatDateTime(v.createdAt)} por {v.createdBy} · {v.laborCount} MO ·{" "}
                  {v.equipmentCount} equip. ·{" "}
                  <span className="tabular font-medium text-foreground">
                    {formatCurrency(v.totalAmount)}
                  </span>
                </div>
                {req ? (
                  <div className="text-muted-foreground">
                    Enviada para {req.sentToName} ({req.sentToEmail}) em{" "}
                    {formatDateTime(req.sentAt)}
                    {req.decidedAt ? ` · decisão em ${formatDateTime(req.decidedAt)}` : ""}
                    {req.comment ? ` · “${req.comment}”` : ""}
                  </div>
                ) : null}
                {sig ? (
                  <div className="text-muted-foreground">
                    Assinada por {sig.signerName} em {formatDateTime(sig.signedAt)}
                  </div>
                ) : null}
              </div>
              <Button asChild size="sm" variant="outline">
                <a
                  href={`/api/medicoes/${medicaoId}/versoes/${v.version}/pdf?inline=1`}
                  target="_blank"
                  rel="noopener"
                >
                  <FileDown aria-hidden /> PDF v{v.version}
                </a>
              </Button>
            </li>
          );
        })}
      </ul>

      {versoes.length >= 2 ? (
        <div className="space-y-3 rounded-md border bg-card p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Comparar versão</span>
              <Select value={a} onValueChange={setA}>
                <SelectTrigger className="w-28" aria-label="Versão A">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {versoes.map((v) => (
                    <SelectItem key={v.id} value={String(v.version)}>
                      v{v.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">com a versão</span>
              <Select value={b} onValueChange={setB}>
                <SelectTrigger className="w-28" aria-label="Versão B">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {versoes.map((v) => (
                    <SelectItem key={v.id} value={String(v.version)}>
                      v{v.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={() => void comparar()} disabled={busy || a === b}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <GitCompare aria-hidden />}{" "}
              Comparar
            </Button>
          </div>
          {erro ? (
            <EstadoErro
              titulo="Não foi possível comparar"
              onRetry={() => void comparar()}
              className="py-6"
            />
          ) : null}
          {cmp ? <Comparacao cmp={cmp} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function Comparacao({ cmp }: { cmp: VersionComparison }) {
  const mudancas = cmp.totais.filter((t) => t.diferenca !== "0.00");
  return (
    <div className="space-y-4 text-sm" data-testid="comparacao">
      <div>
        <h4 className="mb-1 font-medium">
          Totais (v{cmp.a} → v{cmp.b})
        </h4>
        {mudancas.length === 0 ? (
          <p className="text-muted-foreground">Nenhum total mudou.</p>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="h-8">Total</TableHead>
                  <TableHead className="h-8 text-right">v{cmp.a}</TableHead>
                  <TableHead className="h-8 text-right">v{cmp.b}</TableHead>
                  <TableHead className="h-8 text-right">Diferença</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mudancas.map((t) => (
                  <TableRow key={t.campo}>
                    <TableCell className="py-1.5">{t.rotulo}</TableCell>
                    <TableCell className="py-1.5 text-right tabular">
                      {formatCurrency(t.a)}
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular">
                      {formatCurrency(t.b)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "py-1.5 text-right tabular font-medium",
                        t.diferenca.startsWith("-") ? "text-status-red" : "text-status-green",
                      )}
                    >
                      {formatCurrency(t.diferenca)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      {cmp.cabecalho.length ? (
        <div>
          <h4 className="mb-1 font-medium">Dados do boletim</h4>
          <ul className="space-y-1">
            {cmp.cabecalho.map((c) => (
              <li key={c.campo}>
                <span className="text-muted-foreground">{c.rotulo}:</span> {c.a || "—"} →{" "}
                <strong>{c.b || "—"}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ItensDiff titulo="Mão de obra" diff={cmp.maoDeObra} />
      <ItensDiff titulo="Equipamentos" diff={cmp.equipamentos} />
    </div>
  );
}

function ItensDiff({ titulo, diff }: { titulo: string; diff: VersionComparison["maoDeObra"] }) {
  const total = diff.adicionados.length + diff.removidos.length + diff.alterados.length;
  return (
    <div>
      <h4 className="mb-1 font-medium">
        {titulo}: {diff.adicionados.length} adicionado(s), {diff.removidos.length} removido(s),{" "}
        {diff.alterados.length} alterado(s), {diff.inalterados} sem mudança
      </h4>
      {total === 0 ? null : (
        <ul className="space-y-1">
          {diff.adicionados.map((i) => (
            <li key={`a-${i.id}`} className="text-status-green">
              + {i.code} {i.label} · {formatQuantity(i.quantity)} {i.unit} ×{" "}
              {formatCurrency(i.unitPrice)} = {formatCurrency(i.totalPrice)}
            </li>
          ))}
          {diff.removidos.map((i) => (
            <li key={`r-${i.id}`} className="text-status-red">
              − {i.code} {i.label} · {formatCurrency(i.totalPrice)}
            </li>
          ))}
          {diff.alterados.map((i) => (
            <li key={`c-${i.id}`}>
              ~ {i.code} {i.label}:{" "}
              {i.campos.map((c) => (
                <span key={c.campo} className="mr-2">
                  {c.rotulo} {c.a} → <strong>{c.b}</strong>
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
