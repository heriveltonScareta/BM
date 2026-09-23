import Decimal from "decimal.js";
import { parseDecimalInput } from "@/lib/validation/money";

/**
 * Converte um valor canonico ("1234.565") em texto editavel pt-BR sem separador de milhar
 * ("1234,565"), removendo zeros a direita desnecessarios (mantendo ao menos `minDecimals`).
 */
export function toInputNumber(value: string | number | null | undefined, minDecimals = 0): string {
  if (value === null || value === undefined || value === "") return "";
  const parsed = parseDecimalInput(String(value));
  if (!parsed) return String(value);
  let s = parsed.toFixed(Math.max(minDecimals, 6));
  if (s.includes(".")) {
    const [int, frac = ""] = s.split(".");
    let trimmed = frac.replace(/0+$/, "");
    if (trimmed.length < minDecimals) trimmed = trimmed.padEnd(minDecimals, "0");
    s = trimmed ? `${int}.${trimmed}` : int!;
  }
  return s.replace(".", ",");
}

/** Prévia no cliente: quantidade x valor unitário com 2 casas (mesma regra do servidor). */
export function previewItemTotal(quantity: string, unitPrice: string): Decimal | null {
  const q = parseDecimalInput(quantity);
  const p = parseDecimalInput(unitPrice);
  if (!q || !p) return null;
  return q.times(p).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
