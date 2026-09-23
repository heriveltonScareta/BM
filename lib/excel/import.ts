import * as XLSX from "xlsx";
import {
  COL_CODE,
  COL_DAYS_HOURS,
  COL_DESCRIPTION,
  COL_EQUIPMENT,
  COL_QUANTITY,
  COL_ROLE,
  COL_UNIT,
  COL_UNIT_PRICE,
  EQUIPMENT_COLUMNS,
  LABOR_COLUMNS,
  MAX_ROWS,
  SHEET_EQUIPMENT,
  SHEET_LABOR,
  normalizeName,
} from "./columns";
import { parseDecimalInput } from "@/lib/validation/money";
import type { EquipmentItemData, LaborItemData } from "@/lib/validation/measurement";

/** Erro estruturado exibido em tabela na tela (Secao 10). */
export interface ImportError {
  aba: string;
  linha: number;
  coluna: string;
  valorRecebido: string;
  motivo: string;
}

export interface ImportResult {
  laborItems: LaborItemData[];
  equipmentItems: EquipmentItemData[];
  errors: ImportError[];
  /** Abas reconhecidas no arquivo */
  sheets: { labor: boolean; equipment: boolean };
}

type Cell = string | number | boolean | Date | null | undefined;
type Matrix = Cell[][];

function cellText(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

/** Le o arquivo (xlsx ou csv) e devolve as matrizes das abas relevantes. */
export function readWorkbook(buffer: Buffer): {
  labor?: Matrix;
  equipment?: Matrix;
  sheetNames: string[];
} {
  // CSV/texto: decodifica como UTF-8 (o SheetJS leria o buffer como latin1 e quebraria acentos)
  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  const wb = isZip
    ? XLSX.read(buffer, { type: "buffer", raw: true, cellDates: false, dense: true })
    : XLSX.read(buffer.toString("utf8").replace(/^\uFEFF/, ""), {
        type: "string",
        raw: true,
        dense: true,
      });
  const result: { labor?: Matrix; equipment?: Matrix; sheetNames: string[] } = {
    sheetNames: wb.SheetNames,
  };
  const toMatrix = (name: string): Matrix =>
    XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name]!, {
      header: 1,
      raw: true,
      defval: null,
      // true: preserva a numeracao original das linhas para os erros
      blankrows: true,
    });

  for (const name of wb.SheetNames) {
    const n = normalizeName(name);
    if (n === normalizeName(SHEET_LABOR)) result.labor = toMatrix(name);
    else if (n === normalizeName(SHEET_EQUIPMENT)) result.equipment = toMatrix(name);
  }
  // CSV (ou xlsx com uma aba de nome diferente): detecta o tipo pelo cabecalho
  if (!result.labor && !result.equipment && wb.SheetNames.length === 1) {
    const matrix = toMatrix(wb.SheetNames[0]!);
    const header = (matrix[0] ?? []).map(normalizeName);
    if (header.includes(normalizeName(COL_ROLE))) result.labor = matrix;
    else if (header.includes(normalizeName(COL_EQUIPMENT))) result.equipment = matrix;
  }
  return result;
}

interface ColumnMap {
  [column: string]: number;
}

function mapColumns(
  header: Cell[],
  expected: readonly string[],
): { map: ColumnMap; missing: string[] } {
  const normalized = header.map(normalizeName);
  const map: ColumnMap = {};
  const missing: string[] = [];
  for (const col of expected) {
    const idx = normalized.indexOf(normalizeName(col));
    if (idx === -1) missing.push(col);
    else map[col] = idx;
  }
  return { map, missing };
}

function isBlankRow(row: Cell[]): boolean {
  return row.every((c) => cellText(c) === "");
}

interface ParsedRow {
  code: string;
  label: string;
  description: string | null;
  quantity: string;
  unit: string;
  daysHours: string;
  unitPrice: string;
}

function parseSheet(
  aba: string,
  matrix: Matrix,
  expected: readonly string[],
  labelColumn: string,
  errors: ImportError[],
): ParsedRow[] {
  const header = matrix[0] ?? [];
  const { map, missing } = mapColumns(header, expected);
  if (missing.length) {
    for (const col of missing) {
      errors.push({
        aba,
        linha: 1,
        coluna: col,
        valorRecebido: header.map(cellText).filter(Boolean).join(" | ") || "(vazio)",
        motivo: "Coluna obrigatória ausente no cabeçalho.",
      });
    }
    return [];
  }

  const rows: ParsedRow[] = [];
  const text = (row: Cell[], col: string) => cellText(row[map[col]!]);

  const requireText = (row: Cell[], col: string, linha: number, max: number): string | null => {
    const v = text(row, col);
    if (!v) {
      errors.push({
        aba,
        linha,
        coluna: col,
        valorRecebido: "(vazio)",
        motivo: "Campo obrigatório.",
      });
      return null;
    }
    if (v.length > max) {
      errors.push({
        aba,
        linha,
        coluna: col,
        valorRecebido: v,
        motivo: `Máximo de ${max} caracteres.`,
      });
      return null;
    }
    return v;
  };

  const requireNumber = (
    row: Cell[],
    col: string,
    linha: number,
    options: { optional?: boolean },
  ): string | null => {
    const raw = row[map[col]!];
    const v = cellText(raw);
    if (!v) {
      if (options.optional) return "0";
      errors.push({
        aba,
        linha,
        coluna: col,
        valorRecebido: "(vazio)",
        motivo: "Campo obrigatório.",
      });
      return null;
    }
    const parsed = typeof raw === "number" ? parseDecimalInput(raw) : parseDecimalInput(v);
    if (!parsed) {
      errors.push({
        aba,
        linha,
        coluna: col,
        valorRecebido: v,
        motivo: "Não é um número válido (use 1.234,56 ou 1234.56).",
      });
      return null;
    }
    if (parsed.lt(0)) {
      errors.push({
        aba,
        linha,
        coluna: col,
        valorRecebido: v,
        motivo: "O valor não pode ser negativo.",
      });
      return null;
    }
    return parsed.toFixed();
  };

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (isBlankRow(row)) continue;
    const linha = i + 1;
    const code = requireText(row, COL_CODE, linha, 30);
    const label = requireText(row, labelColumn, linha, 120);
    const description = text(row, COL_DESCRIPTION);
    if (description.length > 240)
      errors.push({
        aba,
        linha,
        coluna: COL_DESCRIPTION,
        valorRecebido: description,
        motivo: "Máximo de 240 caracteres.",
      });
    const quantity = requireNumber(row, COL_QUANTITY, linha, {});
    const unit = requireText(row, COL_UNIT, linha, 12);
    const daysHours = requireNumber(row, COL_DAYS_HOURS, linha, { optional: true });
    const unitPrice = requireNumber(row, COL_UNIT_PRICE, linha, {});
    if (code && label && quantity && unit && daysHours && unitPrice && description.length <= 240) {
      rows.push({
        code,
        label,
        description: description || null,
        quantity,
        unit,
        daysHours,
        unitPrice,
      });
    }
  }
  return rows;
}

/**
 * Valida o arquivo inteiro. Se houver QUALQUER erro, `errors` vem preenchido e nada deve
 * ser gravado (tudo ou nada). "Valor Total" nunca e lido: e sempre recalculado.
 */
export function parseImport(buffer: Buffer): ImportResult {
  const errors: ImportError[] = [];
  let wb: ReturnType<typeof readWorkbook>;
  try {
    wb = readWorkbook(buffer);
  } catch {
    return {
      laborItems: [],
      equipmentItems: [],
      sheets: { labor: false, equipment: false },
      errors: [
        {
          aba: "—",
          linha: 0,
          coluna: "—",
          valorRecebido: "(arquivo)",
          motivo: "Não foi possível ler o arquivo. Use .xlsx ou .csv.",
        },
      ],
    };
  }
  if (!wb.labor && !wb.equipment) {
    errors.push({
      aba: wb.sheetNames.join(", ") || "—",
      linha: 0,
      coluna: "—",
      valorRecebido: wb.sheetNames.join(", ") || "(sem abas)",
      motivo: `Nenhuma aba "${SHEET_LABOR}" ou "${SHEET_EQUIPMENT}" encontrada (ou cabeçalho sem "${COL_ROLE}"/"${COL_EQUIPMENT}" no CSV).`,
    });
    return {
      laborItems: [],
      equipmentItems: [],
      errors,
      sheets: { labor: false, equipment: false },
    };
  }

  // linhas de dados (sem o cabecalho de cada aba)
  const totalRows =
    Math.max(0, (wb.labor?.length ?? 1) - 1) + Math.max(0, (wb.equipment?.length ?? 1) - 1);
  if (totalRows > MAX_ROWS) {
    errors.push({
      aba: "—",
      linha: totalRows,
      coluna: "—",
      valorRecebido: String(totalRows),
      motivo: `Limite de ${MAX_ROWS} linhas por importação excedido.`,
    });
    return {
      laborItems: [],
      equipmentItems: [],
      errors,
      sheets: { labor: !!wb.labor, equipment: !!wb.equipment },
    };
  }

  const labor = wb.labor ? parseSheet(SHEET_LABOR, wb.labor, LABOR_COLUMNS, COL_ROLE, errors) : [];
  const equipment = wb.equipment
    ? parseSheet(SHEET_EQUIPMENT, wb.equipment, EQUIPMENT_COLUMNS, COL_EQUIPMENT, errors)
    : [];

  errors.sort((a, b) => a.aba.localeCompare(b.aba) || a.linha - b.linha);
  return {
    laborItems: errors.length
      ? []
      : labor.map((r) => ({
          code: r.code,
          role: r.label,
          description: r.description,
          quantity: r.quantity,
          unit: r.unit,
          daysHours: r.daysHours,
          unitPrice: r.unitPrice,
        })),
    equipmentItems: errors.length
      ? []
      : equipment.map((r) => ({
          code: r.code,
          name: r.label,
          description: r.description,
          quantity: r.quantity,
          unit: r.unit,
          daysHours: r.daysHours,
          unitPrice: r.unitPrice,
        })),
    errors,
    sheets: { labor: !!wb.labor, equipment: !!wb.equipment },
  };
}
