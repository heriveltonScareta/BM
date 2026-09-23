"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTablePagination } from "@/components/tabelas/data-table";
import { EstadoVazio } from "@/components/estados";
import { formatCnpj } from "@/lib/validation/cnpj";
import type { ClientListRow } from "@/lib/services/client.service";

export function AtivoBadge({ ativo }: { ativo: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        ativo
          ? "border-status-green/30 bg-status-green-bg text-status-green"
          : "border-status-gray/30 bg-status-gray-bg text-status-gray"
      }
    >
      {ativo ? "Ativo" : "Inativo"}
    </Badge>
  );
}

const columns: ColumnDef<ClientListRow, unknown>[] = [
  {
    id: "code",
    accessorKey: "code",
    header: "Código",
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span>,
  },
  {
    id: "tradeName",
    accessorKey: "tradeName",
    header: "Cliente",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="font-medium">{row.original.tradeName}</div>
        <div className="truncate text-xs text-muted-foreground">{row.original.legalName}</div>
      </div>
    ),
  },
  {
    id: "cnpj",
    accessorKey: "cnpj",
    header: "CNPJ",
    cell: ({ row }) => <span className="tabular">{formatCnpj(row.original.cnpj)}</span>,
  },
  {
    id: "contracts",
    header: "Contratos",
    enableSorting: false,
    cell: ({ row }) => row.original._count.contracts,
    meta: { align: "right" },
  },
  {
    id: "measurements",
    header: "Medições",
    enableSorting: false,
    cell: ({ row }) => row.original._count.measurements,
    meta: { align: "right" },
  },
  {
    id: "isActive",
    accessorKey: "isActive",
    header: "Situação",
    cell: ({ row }) => <AtivoBadge ativo={row.original.isActive} />,
  },
];

export function ClientesTabela({
  data,
  pagination,
  sort,
  order,
  podeCriar,
  filtrado,
}: {
  data: ClientListRow[];
  pagination: DataTablePagination;
  sort: string;
  order: "asc" | "desc";
  podeCriar: boolean;
  filtrado: boolean;
}) {
  return (
    <DataTable
      columns={columns}
      data={data}
      pagination={pagination}
      sort={sort}
      order={order}
      caption="Lista de clientes"
      getRowHref={(c) => `/clientes/${c.id}`}
      renderCard={(c) => (
        <Link
          href={`/clientes/${c.id}`}
          className="block rounded-md border bg-card p-3 hover:bg-accent focus-visible:outline-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium">{c.tradeName}</div>
              <div className="truncate text-xs text-muted-foreground">{c.legalName}</div>
            </div>
            <AtivoBadge ativo={c.isActive} />
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div>
              <dt className="text-muted-foreground">Código</dt>
              <dd className="font-mono">{c.code}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Contratos</dt>
              <dd className="tabular">{c._count.contracts}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Medições</dt>
              <dd className="tabular">{c._count.measurements}</dd>
            </div>
          </dl>
          <div className="mt-1 text-xs text-muted-foreground tabular">{formatCnpj(c.cnpj)}</div>
        </Link>
      )}
      emptyState={
        filtrado ? (
          <EstadoVazio
            titulo="Nenhum cliente encontrado"
            descricao="Ajuste a busca ou os filtros para ver outros clientes."
          />
        ) : (
          <EstadoVazio
            titulo="Nenhum cliente cadastrado"
            descricao="Cadastre o primeiro cliente para começar a emitir boletins de medição."
            acao={podeCriar ? { label: "Novo cliente", href: "/clientes/novo" } : undefined}
          />
        )
      }
    />
  );
}
