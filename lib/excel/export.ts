import * as XLSX from "xlsx";
import Decimal from "decimal.js";
import {
  COL_TOTAL,
  EQUIPMENT_COLUMNS,
  LABOR_COLUMNS,
  SHEET_EQUIPMENT,
  SHEET_LABOR,
} from "./columns";
import type { ItemDto } from "@/lib/services/measurement-dto";

const NUMBER_FMT = "#,##0.00";
const QTY_FMT = "#,##0.####";

function itemsSheet(columns: readonly string[], items: ItemDto[]) {
  const rows: Array<Array<string | number>> = [[...columns, COL_TOTAL]];
  for (const i of items) {
    rows.push([
      i.code,
      i.label,
      i.description ?? "",
      new Decimal(i.quantity).toNumber(),
      i.unit,
      new Decimal(i.daysHours).toNumber(),
      new Decimal(i.unitPrice).toNumber(),
      new Decimal(i.totalPrice).toNumber(),
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 10 },
    { wch: 32 },
    { wch: 28 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
  ];
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let r = 1; r <= range.e.r; r++) {
    for (const [c, fmt] of [
      [3, QTY_FMT],
      [5, QTY_FMT],
      [6, NUMBER_FMT],
      [7, NUMBER_FMT],
    ] as const) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === "number") cell.z = fmt;
    }
  }
  return ws;
}

/** Exporta mao de obra e equipamentos no mesmo layout do modelo (com "Valor Total" calculado). */
export function buildItemsWorkbook(input: {
  number: string;
  laborItems: ItemDto[];
  equipmentItems: ItemDto[];
}): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, itemsSheet(LABOR_COLUMNS, input.laborItems), SHEET_LABOR);
  XLSX.utils.book_append_sheet(
    wb,
    itemsSheet(EQUIPMENT_COLUMNS, input.equipmentItems),
    SHEET_EQUIPMENT,
  );
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}
