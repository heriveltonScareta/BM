import * as XLSX from "xlsx";
import {
  COL_TOTAL,
  EQUIPMENT_COLUMNS,
  LABOR_COLUMNS,
  SHEET_EQUIPMENT,
  SHEET_LABOR,
} from "./columns";

const LABOR_EXAMPLES: Array<Array<string | number>> = [
  ["MO-001", "Encarregado de perfuração", "Turno diurno", 176, "h", 22, 62.5],
  ["MO-002", "Operador de perfuratriz", "", 176, "h", 22, 48.9],
];
const EQUIPMENT_EXAMPLES: Array<Array<string | number>> = [
  ["EQ-001", "Perfuratriz hidráulica", "", 150, "h", 22, 385],
  ["EQ-002", "Caminhão pipa 15.000 L", "Inclui motorista", 20, "dia", 20, 1140],
];

function sheet(columns: readonly string[], examples: Array<Array<string | number>>) {
  const rows = [[...columns, COL_TOTAL], ...examples.map((r) => [...r, ""])];
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
  return ws;
}

/** Planilha modelo com as abas "Mao de Obra" e "Equipamentos" e linhas de exemplo validas. */
export function buildTemplateWorkbook(): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(LABOR_COLUMNS, LABOR_EXAMPLES), SHEET_LABOR);
  XLSX.utils.book_append_sheet(wb, sheet(EQUIPMENT_COLUMNS, EQUIPMENT_EXAMPLES), SHEET_EQUIPMENT);
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

export const TEMPLATE_FILE_NAME = "modelo-importacao-medicao.xlsx";
