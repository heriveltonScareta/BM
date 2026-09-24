"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import Decimal from "decimal.js";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  type ColumnMeta,
  DataTable,
  type DataTablePagination,
  HIDE_BELOW,
} from "@/components/tabelas/data-table";
import { SelectUrl } from "@/components/tabelas/filtros";
import { EstadoVazio } from "@/components/estados";
import { StatusBadge } from "@/components/medicao/status-badge";
import { GraficoBarras } from "@/components/graficos/grafico-barras";
import { useUrlState } from "@/hooks/use-url-state";
import type { ReportResult, ReportRow } from "@/lib/services/report.service";
import type { ReportType } from "@/lib/validation/report";
import { ALL_STATUSES, STATUS_LABELS, STATUS_TONES } from "@/lib/services/status-machine";
import { INVOICE_STATUS_LABELS } from "@/lib/validation/invoice";
import type { InvoiceStatus } from "@/lib/db/generated/enums";
import { formatCurrency } from "@/lib/utils/format";
import { formatCompetence, formatDate, formatTimestampAsDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

export const TIPOS: Array<{ value: ReportType; label: string; descricao: string }> = [
  {
    value: "medicoes",
    label: "Medições",
    descricao: "Todas as medições do período, com totais de mão de obra e equipamentos.",
  },
  {
    value: "financeiro",
    label: "Financeiro",
    descricao: "Medições não canceladas com assinatura e nota fiscal, para conciliação.",
  },
  {
    value: "faturamento",
    label: "Faturamento",
    descricao: "Medições liberadas, com NF anexada e faturadas; destaca divergências de valor.",
  },
];

interface Props {
  tipo: ReportType;
  tiposPermitidos: ReportType[];
  resultado: ReportResult;
  competences: string[];
  clientes: Array<{ id: string; tradeName: string }>;
  sort: string;
  order: "asc" | "desc";
  filtrado: boolean;
}

const numero: ColumnDef<ReportRow, unknown> = {
  id: "number",
  header: "Número",
  cell: ({ row }) => (
    <Link
      href={`/medicoes/${row.original.id}`}
      className="font-mono text-xs underline-offset-2 hover:underline"
    >
      {row.original.number}
    </Link>
  ),
};
const competencia: ColumnDef<ReportRow, unknown> = {
  id: "competence",
  header: "Competência",
  cell: ({ row }) => <span className="tabular">{formatCompetence(row.original.competence)}</span>,
};
const cliente: ColumnDef<ReportRow, unknown> = {
  id: "client",
  header: "Cliente",
  cell: ({ row }) => (
    <div className="min-w-0">
      <div>{row.original.client}</div>
      <div className="text-xs text-muted-foreground">{row.original.contract}</div>
    </div>
  ),
};
const status: ColumnDef<ReportRow, unknown> = {
  id: "status",
  header: "Status",
  cell: ({ row }) => <StatusBadge status={row.original.status} />,
};
const total: ColumnDef<ReportRow, unknown> = {
  id: "totalAmount",
  header: "Total",
  meta: { align: "right" },
  cell: ({ row }) => formatCurrency(row.original.totalAmount),
};
const nf: ColumnDef<ReportRow, unknown> = {
  id: "invoice",
  header: "NF",
  enableSorting: false,
  cell: ({ row }) => row.original.invoiceNumber ?? "—",
};
const valorNf: ColumnDef<ReportRow, unknown> = {
  id: "invoiceAmount",
  header: "Valor NF",
  meta: { align: "right" },
  enableSorting: false,
  cell: ({ row }) =>
    row.original.invoiceAmount ? formatCurrency(row.original.invoiceAmount) : "—",
};

const COLUNAS: Record<ReportType, ColumnDef<ReportRow, unknown>[]> = {
  medicoes: [
    numero,
    competencia,
    cliente,
    {
      id: "frs",
      header: "FRS / PC",
      enableSorting: false,
      meta: { hideBelow: "xl" },
      cell: ({ row }) => (
        <span className="text-xs">
          {[row.original.frs, row.original.purchaseOrder].filter(Boolean).join(" · ") || "—"}
        </span>
      ),
    },
    status,
    {
      id: "laborTotal",
      header: "Mão de obra",
      meta: { align: "right" },
      enableSorting: false,
      cell: ({ row }) => formatCurrency(row.original.laborTotal),
    },
    {
      id: "equipmentTotal",
      header: "Equipamentos",
      meta: { align: "right" },
      enableSorting: false,
      cell: ({ row }) => formatCurrency(row.original.equipmentTotal),
    },
    total,
  ],
  financeiro: [
    numero,
    competencia,
    cliente,
    status,
    total,
    {
      id: "signedAt",
      header: "Assinado em",
      enableSorting: false,
      meta: { hideBelow: "xl" },
      cell: ({ row }) =>
        row.original.signedAt ? formatTimestampAsDate(row.original.signedAt) : "—",
    },
    nf,
    valorNf,
  ],
  faturamento: [
    numero,
    competencia,
    cliente,
    status,
    total,
    nf,
    {
      id: "invoiceStatus",
      header: "Status NF",
      enableSorting: false,
      meta: { hideBelow: "2xl" },
      cell: ({ row }) =>
        row.original.invoiceStatus
          ? INVOICE_STATUS_LABELS[row.original.invoiceStatus as InvoiceStatus]
          : "—",
    },
    {
      id: "invoiceIssueDate",
      header: "Emissão NF",
      enableSorting: false,
      meta: { hideBelow: "2xl" },
      cell: ({ row }) =>
        row.original.invoiceIssueDate ? formatDate(row.original.invoiceIssueDate) : "—",
    },
    valorNf,
    {
      id: "diff",
      header: "Diferença",
      meta: { align: "right" },
      enableSorting: false,
      cell: ({ row }) => {
        if (!row.original.invoiceAmount) return "—";
        const diff = new Decimal(row.original.invoiceAmount).minus(row.original.totalAmount);
        return (
          <span className={cn(!diff.isZero() && "font-medium text-status-amber")}>
            {formatCurrency(diff.toFixed(2))}
          </span>
        );
      },
    },
  ],
};

/** Rodape de totais alinhado coluna a coluna (respeita as colunas ocultas em telas estreitas). */
function rodape(tipo: ReportType, t: ReportResult["totais"]) {
  const diff = new Decimal(t.invoiceAmount).minus(t.totalAmount);
  const valores: Record<string, string> = {
    laborTotal: formatCurrency(t.laborTotal),
    equipmentTotal: formatCurrency(t.equipmentTotal),
    totalAmount: formatCurrency(t.totalAmount),
    invoiceAmount: formatCurrency(t.invoiceAmount),
    diff: formatCurrency(diff.toFixed(2)),
  };
  return (
    <TableRow>
      {COLUNAS[tipo].map((c, i) => {
        const meta = c.meta as ColumnMeta | undefined;
        return (
          <TableCell
            key={c.id}
            className={cn(
              meta?.align === "right" && "text-right tabular",
              HIDE_BELOW[meta?.hideBelow ?? "none"],
            )}
          >
            {i === 0 ? `Totais (${t.quantidade})` : (valores[c.id ?? ""] ?? "")}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

export function RelatorioView({
  tipo,
  tiposPermitidos,
  resultado,
  competences,
  clientes,
  sort,
  order,
  filtrado,
}: Props) {
  const { setParams } = useUrlState();
  const pathname = usePathname();
  const params = useSearchParams();
  const exportQs = (formato: "xlsx" | "pdf") => {
    const qs = new URLSearchParams(params.toString());
    qs.delete("page");
    qs.delete("pageSize");
    qs.set("tipo", tipo);
    qs.set("formato", formato);
    return `/api/relatorios/exportar?${qs.toString()}`;
  };
  const opcoesCompetencia = competences.map((c) => ({ value: c, label: formatCompetence(c) }));
  const pagination: DataTablePagination = {
    page: resultado.page,
    pageSize: resultado.pageSize,
    total: resultado.total,
    totalPages: resultado.totalPages,
  };
  const descricao = TIPOS.find((t) => t.value === tipo)?.descricao;

  return (
    <div className="space-y-4">
      <nav aria-label="Tipo de relatório" className="flex flex-wrap gap-1 border-b">
        {TIPOS.filter((t) => tiposPermitidos.includes(t.value)).map((t) => (
          <Link
            key={t.value}
            href={t.value === "medicoes" ? pathname : `${pathname}?tipo=${t.value}`}
            aria-current={t.value === tipo ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              t.value === tipo
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {descricao ? <p className="text-sm text-muted-foreground">{descricao}</p> : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <SelectUrl
          param="de"
          label="Competência inicial"
          defaultValue="todas"
          options={[{ value: "todas", label: "De: início" }, ...opcoesCompetencia]}
        />
        <SelectUrl
          param="ate"
          label="Competência final"
          defaultValue="todas"
          options={[{ value: "todas", label: "Até: hoje" }, ...opcoesCompetencia]}
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
        <SelectUrl
          param="statuses"
          label="Status"
          defaultValue="todos"
          options={[
            { value: "todos", label: "Todos os status" },
            ...ALL_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
          ]}
        />
        {filtrado ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setParams(
                { de: null, ate: null, clientId: null, statuses: null },
                { resetPage: true },
              )
            }
          >
            Limpar filtros
          </Button>
        ) : null}
        <div className="flex gap-2 sm:ml-auto">
          <Button asChild variant="outline" size="sm" disabled={resultado.total === 0}>
            <a href={exportQs("xlsx")} download>
              <FileSpreadsheet aria-hidden /> Excel
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={exportQs("pdf")} download>
              <Download aria-hidden /> PDF
            </a>
          </Button>
        </div>
      </div>

      <section aria-label="Resumo por status" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="py-4">
          <CardContent>
            <div className="text-xs text-muted-foreground">Total do filtro</div>
            <div className="text-2xl font-semibold tabular">{resultado.totais.quantidade}</div>
            <div className="text-sm text-muted-foreground tabular" data-testid="total-filtro">
              {formatCurrency(resultado.totais.totalAmount)}
            </div>
          </CardContent>
        </Card>
        {resultado.porStatus.map((s) => (
          <Card key={s.status} className="py-4" data-testid="card-status">
            <CardContent>
              <div className="text-xs">
                <StatusBadge status={s.status} />
              </div>
              <div className="text-2xl font-semibold tabular">{s.quantidade}</div>
              <div className="text-sm text-muted-foreground tabular" data-testid="card-valor">
                {formatCurrency(s.valor)}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <DataTable
        columns={COLUNAS[tipo]}
        data={resultado.rows}
        pagination={pagination}
        sort={sort}
        order={order}
        caption={`Relatório de ${TIPOS.find((t) => t.value === tipo)?.label ?? tipo}`}
        footer={rodape(tipo, resultado.totais)}
        renderCard={(r) => (
          <Link
            href={`/medicoes/${r.id}`}
            className="block rounded-md border bg-card p-3 text-sm hover:bg-muted/40"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs">{r.number}</span>
              <StatusBadge status={r.status} />
            </div>
            <div className="mt-1 font-medium">{r.client}</div>
            <div className="text-xs text-muted-foreground">
              {formatCompetence(r.competence)} · {r.contract}
            </div>
            <div className="mt-1 text-right tabular">{formatCurrency(r.totalAmount)}</div>
          </Link>
        )}
        emptyState={
          <EstadoVazio
            titulo="Nenhuma medição encontrada"
            descricao={
              filtrado
                ? "Ajuste os filtros para ver resultados."
                : "Não há medições para este relatório."
            }
          />
        }
      />

      <section aria-label="Resumos" className="grid gap-4 xl:grid-cols-2">
        <GraficoBarras
          titulo="Por competência"
          descricao="Soma do total das medições filtradas por competência."
          medida="valor"
          dados={resultado.porCompetencia.map((c) => ({
            chave: c.competence,
            label: formatCompetence(c.competence),
            valor: c.valor,
            quantidade: c.quantidade,
          }))}
        />
        <GraficoBarras
          titulo="Por status"
          descricao="Quantidade de medições filtradas por status."
          medida="quantidade"
          orientacao="horizontal"
          dados={resultado.porStatus.map((s) => ({
            chave: s.status,
            label: s.label,
            valor: s.valor,
            quantidade: s.quantidade,
            tone: STATUS_TONES[s.status],
          }))}
        />
      </section>
    </div>
  );
}
