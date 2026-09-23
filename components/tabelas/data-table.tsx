"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUrlState } from "@/hooks/use-url-state";
import { cn } from "@/lib/utils";

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** Quando informado, a tabela e paginada/ordenada no servidor via URL. */
  pagination?: DataTablePagination;
  sort?: string;
  order?: "asc" | "desc";
  /** Cartao exibido no lugar da linha em telas pequenas. */
  renderCard?: (row: T) => React.ReactNode;
  /** Torna a linha clicavel (navega para a URL). */
  getRowHref?: (row: T) => string;
  emptyState: React.ReactNode;
  /** Linha(s) de rodape (ex.: totais); recebe `<TableRow>`s. */
  footer?: React.ReactNode;
  caption?: string;
  className?: string;
}

const PAGE_SIZES = [10, 20, 50, 100];

export function DataTable<T>({
  columns,
  data,
  pagination,
  sort,
  order,
  renderCard,
  getRowHref,
  emptyState,
  footer,
  caption,
  className,
}: DataTableProps<T>) {
  const router = useRouter();
  const { setParams, isPending } = useUrlState();
  // TanStack Table v8 devolve funcoes nao memoizaveis; o React Compiler pula este componente
  // (comportamento esperado pela biblioteca). Sem impacto funcional.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: pagination?.totalPages ?? 1,
  });

  function toggleSort(columnId: string) {
    const nextOrder = sort === columnId && order === "asc" ? "desc" : "asc";
    setParams({ sort: columnId, order: nextOrder }, { resetPage: true });
  }

  function onRowActivate(row: Row<T>) {
    if (!getRowHref) return;
    router.push(getRowHref(row.original));
  }

  if (data.length === 0) return <div className={className}>{emptyState}</div>;

  return (
    <div className={cn("space-y-3", className)} aria-busy={isPending}>
      {renderCard ? (
        <ul className="space-y-2 md:hidden" aria-label={caption}>
          {data.map((row, i) => (
            <li key={i}>{renderCard(row)}</li>
          ))}
        </ul>
      ) : null}
      <div
        className={cn(
          "overflow-x-auto rounded-md border bg-card transition-opacity",
          renderCard && "hidden md:block",
          isPending && "opacity-60",
        )}
      >
        <Table className="text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/50 hover:bg-muted/50">
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort() && !!pagination;
                  const active = sort === header.column.id;
                  const meta = header.column.columnDef.meta as { align?: "right" } | undefined;
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "h-9 whitespace-nowrap",
                        meta?.align === "right" && "text-right",
                      )}
                      aria-sort={
                        active ? (order === "asc" ? "ascending" : "descending") : undefined
                      }
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                          onClick={() => toggleSort(header.column.id)}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {active ? (
                            order === "asc" ? (
                              <ArrowUp className="size-3.5" aria-hidden />
                            ) : (
                              <ArrowDown className="size-3.5" aria-hidden />
                            )
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className={cn(getRowHref && "cursor-pointer")}
                tabIndex={getRowHref ? 0 : undefined}
                onClick={() => onRowActivate(row)}
                onKeyDown={(e) => {
                  if (
                    getRowHref &&
                    (e.key === "Enter" || e.key === " ") &&
                    e.target === e.currentTarget
                  ) {
                    e.preventDefault();
                    onRowActivate(row);
                  }
                }}
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as
                    { align?: "right"; stop?: boolean } | undefined;
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn("py-1.5", meta?.align === "right" && "text-right tabular")}
                      onClick={meta?.stop ? (e) => e.stopPropagation() : undefined}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
          {footer ? <TableFooter>{footer}</TableFooter> : null}
        </Table>
      </div>
      {pagination ? <DataTablePaginationBar pagination={pagination} /> : null}
    </div>
  );
}

export function DataTablePaginationBar({ pagination }: { pagination: DataTablePagination }) {
  const { setParams } = useUrlState();
  const { page, pageSize, total, totalPages } = pagination;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav
      className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
      aria-label="Paginação"
    >
      <p className="tabular">
        {from}–{to} de {total}
      </p>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="sr-only sm:not-sr-only">Por página</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => setParams({ pageSize: v }, { resetPage: true })}
          >
            <SelectTrigger size="sm" className="w-[4.5rem]" aria-label="Itens por página">
              <SelectValue placeholder={String(pageSize)} />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <span className="tabular">
          Página {page} de {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Página anterior"
          disabled={page <= 1}
          onClick={() => setParams({ page: page - 1 })}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Próxima página"
          disabled={page >= totalPages}
          onClick={() => setParams({ page: page + 1 })}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
