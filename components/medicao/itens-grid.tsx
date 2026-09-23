"use client";

import * as React from "react";
import Decimal from "decimal.js";
import { ArrowDown, ArrowUp, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EstadoVazio } from "@/components/estados";
import { api, ApiClientError } from "@/lib/api/client";
import type { ItemDto } from "@/lib/services/measurement-dto";
import type { MeasurementTotals } from "@/lib/services/measurement.service";
import type { ItemKind } from "@/lib/validation/measurement";
import { formatCurrency } from "@/lib/utils/format";
import { previewItemTotal, toInputNumber } from "@/lib/utils/numbers";
import { cn } from "@/lib/utils";

type Field = "code" | "label" | "description" | "quantity" | "unit" | "daysHours" | "unitPrice";
const FIELDS: Field[] = [
  "code",
  "label",
  "description",
  "quantity",
  "unit",
  "daysHours",
  "unitPrice",
];

interface Draft {
  code: string;
  label: string;
  description: string;
  quantity: string;
  unit: string;
  daysHours: string;
  unitPrice: string;
}

interface Row {
  id: string;
  saved: Draft;
  draft: Draft;
  totalPrice: string;
  saving: boolean;
  error: string | null;
}

function toDraft(i: ItemDto): Draft {
  return {
    code: i.code,
    label: i.label,
    description: i.description ?? "",
    quantity: toInputNumber(i.quantity),
    unit: i.unit,
    daysHours: toInputNumber(i.daysHours),
    unitPrice: toInputNumber(i.unitPrice, 2),
  };
}

function toRow(i: ItemDto): Row {
  const d = toDraft(i);
  return {
    id: i.id,
    saved: d,
    draft: { ...d },
    totalPrice: i.totalPrice,
    saving: false,
    error: null,
  };
}

function payload(kind: ItemKind, d: Draft) {
  const base = {
    code: d.code,
    description: d.description,
    quantity: d.quantity,
    unit: d.unit,
    daysHours: d.daysHours || "0",
    unitPrice: d.unitPrice,
  };
  return kind === "mao-de-obra" ? { ...base, role: d.label } : { ...base, name: d.label };
}

const sameDraft = (a: Draft, b: Draft) => FIELDS.every((f) => a[f] === b[f]);

export interface ItensGridProps {
  medicaoId: string;
  kind: ItemKind;
  items: ItemDto[];
  editable: boolean;
  onTotals: (totals: MeasurementTotals) => void;
  onCountChange?: (count: number) => void;
}

export function ItensGrid({
  medicaoId,
  kind,
  items,
  editable,
  onTotals,
  onCountChange,
}: ItensGridProps) {
  const [rows, setRows] = React.useState<Row[]>(() => items.map(toRow));
  const [adding, setAdding] = React.useState(false);
  const refs = React.useRef(new Map<string, HTMLInputElement>());
  const labelHeader = kind === "mao-de-obra" ? "Função" : "Equipamento";
  const base = `/api/medicoes/${medicaoId}/itens/${kind}`;

  // Soma exibida no rodape (Decimal, sem erro de ponto flutuante); a fonte da verdade e o servidor.
  const total = React.useMemo(
    () => rows.reduce((acc, r) => acc.plus(r.totalPrice), new Decimal(0)).toFixed(2),
    [rows],
  );

  const notifyCount = (n: number) => onCountChange?.(n);

  function setRow(id: string, patch: Partial<Row> | ((r: Row) => Partial<Row>)) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, ...(typeof patch === "function" ? patch(r) : patch) } : r,
      ),
    );
  }

  function updateDraft(id: string, field: Field, value: string) {
    setRow(id, (r) => ({ draft: { ...r.draft, [field]: value }, error: null }));
  }

  // Fila de gravacao por linha: se uma gravacao chega enquanto outra esta em voo, marca
  // "again" e regrava com o rascunho mais recente ao terminar. A resposta do servidor
  // substitui o rascunho apenas se ele nao mudou enquanto a requisicao estava em voo.
  const inflight = React.useRef(new Map<string, { again: boolean }>());
  const rowsRef = React.useRef(rows);
  React.useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  async function saveRow(id: string) {
    const current = inflight.current.get(id);
    if (current) {
      current.again = true;
      return;
    }
    const row = rowsRef.current.find((r) => r.id === id);
    if (!row || sameDraft(row.saved, row.draft)) return;
    const entry = { again: false };
    inflight.current.set(id, entry);
    const sent = { ...row.draft };
    setRow(id, { saving: true });
    try {
      const res = await api<{ item: ItemDto; totals: MeasurementTotals }>(`${base}/${id}`, {
        method: "PATCH",
        json: payload(kind, sent),
      });
      const fresh = toRow(res.item);
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                saved: fresh.saved,
                totalPrice: fresh.totalPrice,
                error: null,
                draft: sameDraft(r.draft, sent) ? fresh.draft : r.draft,
              }
            : r,
        ),
      );
      onTotals(res.totals);
    } catch (e) {
      const msg =
        e instanceof ApiClientError && Array.isArray(e.details)
          ? (e.details as Array<{ message: string }>).map((d) => d.message).join(" ")
          : e instanceof ApiClientError
            ? e.message
            : "Não foi possível salvar o item.";
      setRow(id, { error: msg });
    } finally {
      inflight.current.delete(id);
      setRow(id, { saving: false });
      if (entry.again) void saveRow(id);
    }
  }

  function revertField(id: string, field: Field) {
    setRow(id, (r) => ({ draft: { ...r.draft, [field]: r.saved[field] } }));
  }

  async function addRow() {
    setAdding(true);
    const prefix = kind === "mao-de-obra" ? "MO" : "EQ";
    const seq = String(rows.length + 1).padStart(3, "0");
    try {
      const res = await api<{ item: ItemDto; totals: MeasurementTotals }>(base, {
        method: "POST",
        json: payload(kind, {
          code: `${prefix}-${seq}`,
          label: kind === "mao-de-obra" ? "Nova função" : "Novo equipamento",
          description: "",
          quantity: "0",
          unit: "h",
          daysHours: "0",
          unitPrice: "0",
        }),
      });
      setRows((prev) => {
        const next = [...prev, toRow(res.item)];
        notifyCount(next.length);
        return next;
      });
      onTotals(res.totals);
      requestAnimationFrame(() => {
        const el = refs.current.get(`${res.item.id}:label`);
        el?.focus();
        el?.select();
      });
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Não foi possível adicionar o item.");
    } finally {
      setAdding(false);
    }
  }

  async function duplicateRow(id: string) {
    try {
      const res = await api<{ item: ItemDto; totals: MeasurementTotals }>(
        `${base}/${id}/duplicar`,
        { method: "POST" },
      );
      setRows((prev) => {
        const idx = prev.findIndex((r) => r.id === id);
        const next = [...prev.slice(0, idx + 1), toRow(res.item), ...prev.slice(idx + 1)];
        notifyCount(next.length);
        return next;
      });
      onTotals(res.totals);
      toast.success("Item duplicado.");
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Não foi possível duplicar o item.");
    }
  }

  async function deleteRow(id: string) {
    try {
      const res = await api<{ totals: MeasurementTotals }>(`${base}/${id}`, { method: "DELETE" });
      setRows((prev) => {
        const next = prev.filter((r) => r.id !== id);
        notifyCount(next.length);
        return next;
      });
      onTotals(res.totals);
      toast.success("Item excluído.");
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Não foi possível excluir o item.");
    }
  }

  async function move(id: string, dir: -1 | 1) {
    const idx = rows.findIndex((r) => r.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    setRows(next);
    try {
      await api(base, { method: "PATCH", json: { ids: next.map((r) => r.id) } });
    } catch (e) {
      setRows(rows);
      toast.error(e instanceof ApiClientError ? e.message : "Não foi possível reordenar.");
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, id: string, field: Field) {
    if (e.key === "Escape") {
      e.preventDefault();
      revertField(id, field);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const idx = rows.findIndex((r) => r.id === id);
      const nextRow = rows[idx + 1];
      if (nextRow) refs.current.get(`${nextRow.id}:${field}`)?.focus();
      else e.currentTarget.blur();
    }
  }

  const registerRef = (key: string) => (el: HTMLInputElement | null) => {
    if (el) refs.current.set(key, el);
    else refs.current.delete(key);
  };

  function cell(
    row: Row,
    field: Field,
    extra?: { className?: string; numeric?: boolean; label: string },
  ) {
    const value = row.draft[field];
    if (!editable) {
      return (
        <span className={cn(extra?.numeric && "tabular block text-right")}>
          {field === "quantity" || field === "daysHours" || field === "unitPrice"
            ? value.replace(".", ",")
            : value || "—"}
        </span>
      );
    }
    return (
      <Input
        ref={registerRef(`${row.id}:${field}`)}
        aria-label={`${extra?.label ?? field} do item ${row.saved.code}`}
        value={value}
        inputMode={extra?.numeric ? "decimal" : undefined}
        className={cn("h-8 px-2 text-sm", extra?.numeric && "tabular text-right", extra?.className)}
        onChange={(e) => updateDraft(row.id, field, e.target.value)}
        onBlur={() => void saveRow(row.id)}
        onKeyDown={(e) => onKeyDown(e, row.id, field)}
      />
    );
  }

  function preview(row: Row) {
    const dirty = !sameDraft(row.saved, row.draft);
    if (dirty) {
      const p = previewItemTotal(row.draft.quantity, row.draft.unitPrice);
      return (
        <span
          className="tabular text-muted-foreground"
          title="Prévia; o valor final é calculado pelo servidor"
        >
          {p ? formatCurrency(p.toFixed(2)) : "—"}
        </span>
      );
    }
    return <span className="tabular">{formatCurrency(row.totalPrice)}</span>;
  }

  function actions(row: Row, idx: number) {
    if (!editable) return null;
    return (
      <div className="flex items-center justify-end gap-0.5">
        {row.saving ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Salvando" />
        ) : null}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Mover para cima"
          disabled={idx === 0}
          onClick={() => void move(row.id, -1)}
        >
          <ArrowUp aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Mover para baixo"
          disabled={idx === rows.length - 1}
          onClick={() => void move(row.id, 1)}
        >
          <ArrowDown aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Duplicar item"
          onClick={() => void duplicateRow(row.id)}
        >
          <Copy aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Excluir item"
          className="text-status-red"
          onClick={() => void deleteRow(row.id)}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
    );
  }

  const addButton = editable ? (
    <Button size="sm" onClick={() => void addRow()} disabled={adding}>
      {adding ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} Adicionar
      linha
    </Button>
  ) : null;

  if (rows.length === 0) {
    return (
      <EstadoVazio
        titulo={
          kind === "mao-de-obra" ? "Nenhuma mão de obra lançada" : "Nenhum equipamento lançado"
        }
        descricao={
          editable
            ? "Adicione linhas manualmente ou importe uma planilha."
            : "Esta medição não possui itens desta categoria."
        }
        acao={editable ? { label: "Adicionar linha", onClick: () => void addRow() } : undefined}
        className="py-10"
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? "item" : "itens"}
          {editable
            ? " · Tab move entre células, Enter desce, Esc desfaz a célula. Salva ao sair da célula."
            : ""}
        </p>
        {addButton}
      </div>

      {/* celular: cards */}
      <ul className="space-y-3 md:hidden" aria-label={`Itens de ${labelHeader.toLowerCase()}`}>
        {rows.map((row, idx) => (
          <li
            key={row.id}
            className={cn("rounded-md border bg-card p-3", row.error && "border-status-red")}
          >
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted-foreground">
                Código{cell(row, "code", { label: "Código" })}
              </label>
              <label className="text-xs text-muted-foreground">
                Unidade{cell(row, "unit", { label: "Unidade" })}
              </label>
              <label className="col-span-2 text-xs text-muted-foreground">
                {labelHeader}
                {cell(row, "label", { label: labelHeader })}
              </label>
              <label className="col-span-2 text-xs text-muted-foreground">
                Descrição{cell(row, "description", { label: "Descrição" })}
              </label>
              <label className="text-xs text-muted-foreground">
                Quantidade{cell(row, "quantity", { numeric: true, label: "Quantidade" })}
              </label>
              <label className="text-xs text-muted-foreground">
                Dias/Horas{cell(row, "daysHours", { numeric: true, label: "Dias/Horas" })}
              </label>
              <label className="text-xs text-muted-foreground">
                Valor unitário{cell(row, "unitPrice", { numeric: true, label: "Valor unitário" })}
              </label>
              <div className="text-xs text-muted-foreground">
                Total
                <div className="mt-1 text-sm font-medium">{preview(row)}</div>
              </div>
            </div>
            {row.error ? (
              <p className="mt-2 text-xs text-status-red" role="alert">
                {row.error}
              </p>
            ) : null}
            <div className="mt-2">{actions(row, idx)}</div>
          </li>
        ))}
      </ul>

      {/* desktop: grade */}
      <div className="hidden overflow-hidden rounded-md border bg-card md:block">
        <Table className="text-sm">
          <caption className="sr-only">Itens de {labelHeader.toLowerCase()}</caption>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="h-9 w-24">Código</TableHead>
              <TableHead className="h-9 min-w-40">{labelHeader}</TableHead>
              <TableHead className="h-9 min-w-40">Descrição</TableHead>
              <TableHead className="h-9 w-24 text-right">Quantidade</TableHead>
              <TableHead className="h-9 w-20">Unidade</TableHead>
              <TableHead className="h-9 w-24 text-right">Dias/Horas</TableHead>
              <TableHead className="h-9 w-32 text-right">Valor unitário</TableHead>
              <TableHead className="h-9 w-32 text-right">Valor total</TableHead>
              {editable ? <TableHead className="h-9 w-32 text-right">Ações</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => (
              <React.Fragment key={row.id}>
                <TableRow className={cn(row.error && "bg-status-red-bg")}>
                  <TableCell className="p-1">{cell(row, "code", { label: "Código" })}</TableCell>
                  <TableCell className="p-1">
                    {cell(row, "label", { label: labelHeader })}
                  </TableCell>
                  <TableCell className="p-1">
                    {cell(row, "description", { label: "Descrição" })}
                  </TableCell>
                  <TableCell className="p-1">
                    {cell(row, "quantity", { numeric: true, label: "Quantidade" })}
                  </TableCell>
                  <TableCell className="p-1">{cell(row, "unit", { label: "Unidade" })}</TableCell>
                  <TableCell className="p-1">
                    {cell(row, "daysHours", { numeric: true, label: "Dias/Horas" })}
                  </TableCell>
                  <TableCell className="p-1">
                    {cell(row, "unitPrice", { numeric: true, label: "Valor unitário" })}
                  </TableCell>
                  <TableCell className="px-2 py-1 text-right">{preview(row)}</TableCell>
                  {editable ? <TableCell className="p-1">{actions(row, idx)}</TableCell> : null}
                </TableRow>
                {row.error ? (
                  <TableRow className="bg-status-red-bg hover:bg-status-red-bg">
                    <TableCell
                      colSpan={editable ? 9 : 8}
                      className="py-1 text-xs text-status-red"
                      role="alert"
                    >
                      {row.error}
                    </TableCell>
                  </TableRow>
                ) : null}
              </React.Fragment>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={7} className="text-right font-medium">
                Total {kind === "mao-de-obra" ? "mão de obra" : "equipamentos"}
              </TableCell>
              <TableCell className="tabular text-right font-semibold">
                {formatCurrency(total)}
              </TableCell>
              {editable ? <TableCell /> : null}
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
