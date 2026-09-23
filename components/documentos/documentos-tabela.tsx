"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { FileDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTablePagination } from "@/components/tabelas/data-table";
import { EstadoVazio } from "@/components/estados";
import { StatusBadge } from "@/components/medicao/status-badge";
import { DOCUMENT_TYPE_LABELS } from "@/lib/validation/invoice";
import type { DocumentType, MeasurementStatus } from "@/lib/db/generated/enums";
import { formatBytes } from "@/lib/utils/format";
import { formatDateTime } from "@/lib/utils/dates";

export interface DocumentoListaRow {
  id: string;
  type: DocumentType;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  measurement: { id: string; number: string; status: MeasurementStatus } | null;
  client: { id: string; code: string; tradeName: string } | null;
  uploadedBy: string | null;
}

const columns: ColumnDef<DocumentoListaRow, unknown>[] = [
  {
    id: "type",
    header: "Tipo",
    cell: ({ row }) => <Badge variant="secondary">{DOCUMENT_TYPE_LABELS[row.original.type]}</Badge>,
  },
  {
    id: "fileName",
    header: "Arquivo",
    cell: ({ row }) => <span className="font-medium">{row.original.fileName}</span>,
  },
  {
    id: "measurement",
    header: "Medição",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.measurement ? (
        <Link
          href={`/medicoes/${row.original.measurement.id}?aba=documentos`}
          className="inline-flex items-center gap-2 underline-offset-4 hover:underline"
        >
          <span className="font-mono text-xs">{row.original.measurement.number}</span>
          <StatusBadge status={row.original.measurement.status} />
        </Link>
      ) : (
        "—"
      ),
    meta: { stop: true },
  },
  {
    id: "client",
    header: "Cliente",
    enableSorting: false,
    cell: ({ row }) => row.original.client?.tradeName ?? "—",
  },
  {
    id: "sizeBytes",
    header: "Tamanho",
    cell: ({ row }) => formatBytes(row.original.sizeBytes),
    meta: { align: "right" },
  },
  {
    id: "createdAt",
    header: "Data",
    cell: ({ row }) => (
      <span className="tabular text-xs">{formatDateTime(row.original.createdAt)}</span>
    ),
  },
  {
    id: "download",
    header: "",
    enableSorting: false,
    cell: ({ row }) => (
      <Button asChild size="sm" variant="outline">
        <a href={`/api/documentos/${row.original.id}/download`}>
          <FileDown aria-hidden /> Baixar
        </a>
      </Button>
    ),
    meta: { stop: true },
  },
];

export function DocumentosTabela({
  data,
  pagination,
  sort,
  order,
  filtrado,
}: {
  data: DocumentoListaRow[];
  pagination: DataTablePagination;
  sort: string;
  order: "asc" | "desc";
  filtrado: boolean;
}) {
  return (
    <DataTable
      columns={columns}
      data={data}
      pagination={pagination}
      sort={sort}
      order={order}
      caption="Lista de documentos"
      renderCard={(d) => (
        <div className="rounded-md border bg-card p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Badge variant="secondary">{DOCUMENT_TYPE_LABELS[d.type]}</Badge>
              <div className="mt-1 truncate font-medium">{d.fileName}</div>
              <div className="text-xs text-muted-foreground">
                {d.measurement?.number ?? "—"} · {d.client?.tradeName ?? "—"} ·{" "}
                {formatBytes(d.sizeBytes)} · {formatDateTime(d.createdAt)}
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <a href={`/api/documentos/${d.id}/download`}>
                <FileDown aria-hidden /> Baixar
              </a>
            </Button>
          </div>
        </div>
      )}
      emptyState={
        filtrado ? (
          <EstadoVazio
            titulo="Nenhum documento encontrado"
            descricao="Ajuste a busca ou os filtros."
          />
        ) : (
          <EstadoVazio
            titulo="Nenhum documento"
            descricao="Boletins enviados, boletins assinados, notas fiscais e anexos aparecem aqui."
          />
        )
      }
    />
  );
}
