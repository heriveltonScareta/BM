"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type DataTablePagination } from "@/components/tabelas/data-table";
import { EstadoVazio } from "@/components/estados";
import { StatusBadge } from "@/components/medicao/status-badge";
import { formatCurrency } from "@/lib/utils/format";
import { formatCompetence, formatDate, formatTimestampAsDate } from "@/lib/utils/dates";
import type { InvoiceStatus } from "@/lib/db/generated/enums";
import { INVOICE_STATUS_LABELS } from "@/lib/validation/invoice";

export interface MedicaoRow {
  id: string;
  number: string;
  competence: string;
  startDate: string;
  endDate: string;
  issueDate: string;
  frs: string | null;
  purchaseOrder: string | null;
  status: Parameters<typeof StatusBadge>[0]["status"];
  currentVersion: number;
  totalAmount: string;
  updatedAt: string;
  client: { id: string; code: string; tradeName: string };
  contract: { id: string; code: string; name: string; unit: string };
  invoice?: {
    number: string;
    status: InvoiceStatus;
    issueDate: string;
    amount: string;
    sentAt: string | null;
  } | null;
}

const columns: ColumnDef<MedicaoRow, unknown>[] = [
  {
    id: "number",
    header: "Número",
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.number}</span>,
  },
  {
    id: "client",
    header: "Cliente",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="font-medium">{row.original.client.tradeName}</div>
        <div className="truncate text-xs text-muted-foreground">
          {row.original.contract.code} · {row.original.contract.unit}
        </div>
      </div>
    ),
  },
  {
    id: "competence",
    header: "Competência",
    cell: ({ row }) => <span className="tabular">{formatCompetence(row.original.competence)}</span>,
  },
  {
    id: "issueDate",
    header: "Período",
    meta: { hideBelow: "2xl" },
    cell: ({ row }) => (
      <span className="tabular whitespace-nowrap text-xs">
        {formatDate(row.original.startDate)} – {formatDate(row.original.endDate)}
      </span>
    ),
  },
  {
    id: "frs",
    header: "FRS",
    enableSorting: false,
    meta: { hideBelow: "lg" },
    cell: ({ row }) => row.original.frs ?? "—",
  },
  {
    id: "purchaseOrder",
    header: "PC",
    enableSorting: false,
    meta: { hideBelow: "lg" },
    cell: ({ row }) => row.original.purchaseOrder ?? "—",
  },
  {
    id: "totalAmount",
    header: "Total",
    cell: ({ row }) => formatCurrency(row.original.totalAmount),
    meta: { align: "right" },
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    id: "updatedAt",
    header: "Atualizado",
    meta: { hideBelow: "2xl" },
    cell: ({ row }) => (
      <span className="tabular text-xs text-muted-foreground">
        {formatTimestampAsDate(row.original.updatedAt)}
      </span>
    ),
  },
];

const nfColumns: ColumnDef<MedicaoRow, unknown>[] = [
  {
    id: "nf",
    header: "Nota fiscal",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.invoice ? (
        <div className="min-w-0">
          <div className="font-mono text-xs">{row.original.invoice.number}</div>
          <div className="text-xs text-muted-foreground">
            {INVOICE_STATUS_LABELS[row.original.invoice.status]} ·{" "}
            {formatDate(row.original.invoice.issueDate)}
          </div>
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: "nfAmount",
    header: "Valor NF",
    enableSorting: false,
    cell: ({ row }) => (row.original.invoice ? formatCurrency(row.original.invoice.amount) : "—"),
    meta: { align: "right" },
  },
];

export function MedicoesTabela({
  data,
  pagination,
  sort,
  order,
  podeCriar,
  filtrado,
  mostrarNf,
}: {
  data: MedicaoRow[];
  pagination: DataTablePagination;
  sort: string;
  order: "asc" | "desc";
  podeCriar: boolean;
  filtrado: boolean;
  mostrarNf?: boolean;
}) {
  const cols = mostrarNf ? [...columns.slice(0, 6), ...nfColumns, ...columns.slice(6)] : columns;
  return (
    <DataTable
      columns={cols}
      data={data}
      pagination={pagination}
      sort={sort}
      order={order}
      caption="Lista de boletins de medição"
      getRowHref={(m) => `/medicoes/${m.id}`}
      renderCard={(m) => (
        <Link
          href={`/medicoes/${m.id}`}
          className="block rounded-md border bg-card p-3 hover:bg-accent"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-mono text-xs text-muted-foreground">{m.number}</div>
              <div className="font-medium">{m.client.tradeName}</div>
              <div className="truncate text-xs text-muted-foreground">
                {m.contract.code} · {m.contract.unit}
              </div>
            </div>
            <StatusBadge status={m.status} />
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div>
              <dt className="text-muted-foreground">Competência</dt>
              <dd className="tabular">{formatCompetence(m.competence)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">FRS / PC</dt>
              <dd>{[m.frs, m.purchaseOrder].filter(Boolean).join(" / ") || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="tabular font-medium">{formatCurrency(m.totalAmount)}</dd>
            </div>
          </dl>
        </Link>
      )}
      emptyState={
        filtrado ? (
          <EstadoVazio
            titulo="Nenhuma medição encontrada"
            descricao="Ajuste a busca ou os filtros."
          />
        ) : (
          <EstadoVazio
            titulo="Nenhuma medição"
            descricao="Crie o primeiro boletim de medição para começar."
            acao={podeCriar ? { label: "Nova medição", href: "/medicoes/nova" } : undefined}
          />
        )
      }
    />
  );
}
