import * as XLSX from "xlsx";
import Decimal from "decimal.js";
import type { ReportResult } from "@/lib/services/report.service";
import type { ReportType } from "@/lib/validation/report";
import { STATUS_LABELS } from "@/lib/services/status-machine";
import { INVOICE_STATUS_LABELS } from "@/lib/validation/invoice";
import type { InvoiceStatus } from "@/lib/db/generated/enums";
import { formatCompetence, formatDate } from "@/lib/utils/dates";

const MONEY = "#,##0.00";
const num = (v: string | null) => (v === null ? "" : new Decimal(v).toNumber());

export const REPORT_TITLES: Record<ReportType, string> = {
  medicoes: "Relatório de medições",
  financeiro: "Relatório financeiro",
  faturamento: "Relatório de faturamento",
};

/** Exporta o relatorio filtrado (todas as linhas) em xlsx, com aba de resumo. */
export function buildReportWorkbook(tipo: ReportType, r: ReportResult, filtros: string): Buffer {
  const wb = XLSX.utils.book_new();
  const header =
    tipo === "faturamento"
      ? [
          "Número",
          "Cliente",
          "Competência",
          "Status",
          "Total da medição",
          "NF",
          "Status NF",
          "Emissão NF",
          "Valor NF",
          "Diferença",
        ]
      : [
          "Número",
          "Cliente",
          "Contrato",
          "Competência",
          "Emissão",
          "FRS",
          "PC",
          "Status",
          "Mão de obra",
          "Equipamentos",
          "Total",
        ];
  const rows: Array<Array<string | number>> = [header];
  for (const m of r.rows) {
    if (tipo === "faturamento") {
      const diff = m.invoiceAmount
        ? new Decimal(m.invoiceAmount).minus(m.totalAmount).toNumber()
        : "";
      rows.push([
        m.number,
        m.client,
        formatCompetence(m.competence),
        STATUS_LABELS[m.status],
        num(m.totalAmount),
        m.invoiceNumber ?? "",
        m.invoiceStatus ? INVOICE_STATUS_LABELS[m.invoiceStatus as InvoiceStatus] : "",
        m.invoiceIssueDate ? formatDate(m.invoiceIssueDate) : "",
        num(m.invoiceAmount),
        diff,
      ]);
    } else {
      rows.push([
        m.number,
        m.client,
        m.contract,
        formatCompetence(m.competence),
        formatDate(m.issueDate),
        m.frs ?? "",
        m.purchaseOrder ?? "",
        STATUS_LABELS[m.status],
        num(m.laborTotal),
        num(m.equipmentTotal),
        num(m.totalAmount),
      ]);
    }
  }
  if (tipo === "faturamento")
    rows.push([
      "Total",
      "",
      "",
      "",
      num(r.totais.totalAmount),
      "",
      "",
      "",
      num(r.totais.invoiceAmount),
      "",
    ]);
  else
    rows.push([
      "Total",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      num(r.totais.laborTotal),
      num(r.totais.equipmentTotal),
      num(r.totais.totalAmount),
    ]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = header.map((h) => ({ wch: Math.max(12, h.length + 4) }));
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const moneyCols = tipo === "faturamento" ? [4, 8, 9] : [8, 9, 10];
  for (let row = 1; row <= range.e.r; row++)
    for (const c of moneyCols) {
      const cell = ws[XLSX.utils.encode_cell({ r: row, c })];
      if (cell && typeof cell.v === "number") cell.z = MONEY;
    }
  XLSX.utils.book_append_sheet(wb, ws, "Dados");

  const resumo: Array<Array<string | number>> = [
    [REPORT_TITLES[tipo]],
    [`Filtros: ${filtros}`],
    [],
    ["Status", "Quantidade", "Valor"],
  ];
  for (const s of r.porStatus) resumo.push([s.label, s.quantidade, num(s.valor)]);
  resumo.push([], ["Cliente", "Quantidade", "Valor"]);
  for (const c of r.porCliente) resumo.push([c.cliente, c.quantidade, num(c.valor)]);
  resumo.push([], ["Competência", "Quantidade", "Valor"]);
  for (const c of r.porCompetencia)
    resumo.push([formatCompetence(c.competence), c.quantidade, num(c.valor)]);
  const ws2 = XLSX.utils.aoa_to_sheet(resumo);
  ws2["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Resumo");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}
