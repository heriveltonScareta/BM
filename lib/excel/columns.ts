/** Contrato da planilha (Secao 10). Cabecalho na linha 1, exatamente estes nomes. */
export const SHEET_LABOR = "Mao de Obra";
export const SHEET_EQUIPMENT = "Equipamentos";

export const COL_CODE = "Código";
export const COL_ROLE = "Função";
export const COL_EQUIPMENT = "Equipamento";
export const COL_DESCRIPTION = "Descrição";
export const COL_QUANTITY = "Quantidade";
export const COL_UNIT = "Unidade";
export const COL_DAYS_HOURS = "Dias/Horas";
export const COL_UNIT_PRICE = "Valor Unitário";
export const COL_TOTAL = "Valor Total";

export const LABOR_COLUMNS = [
  COL_CODE,
  COL_ROLE,
  COL_DESCRIPTION,
  COL_QUANTITY,
  COL_UNIT,
  COL_DAYS_HOURS,
  COL_UNIT_PRICE,
] as const;
export const EQUIPMENT_COLUMNS = [
  COL_CODE,
  COL_EQUIPMENT,
  COL_DESCRIPTION,
  COL_QUANTITY,
  COL_UNIT,
  COL_DAYS_HOURS,
  COL_UNIT_PRICE,
] as const;

export const MAX_ROWS = 5000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Normaliza para comparar nomes de aba/coluna: sem acento, minusculo, espacos unicos. */
export function normalizeName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
