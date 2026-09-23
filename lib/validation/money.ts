import Decimal from "decimal.js";
import { z } from "zod";

/**
 * Converte texto digitado pelo usuario (ou celula de planilha) em Decimal.
 * Aceita formato brasileiro (1.234,56), americano (1,234.56 / 1234.56) e numero puro.
 * Retorna null quando nao for um numero valido.
 */
export function parseDecimalInput(input: string | number | null | undefined): Decimal | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    return Number.isFinite(input) ? new Decimal(input) : null;
  }
  let s = input.trim().replace(/\s/g, "").replace(/^R\$/i, "");
  if (s === "") return null;

  const negative = s.startsWith("-") || (s.startsWith("(") && s.endsWith(")"));
  s = s.replace(/^[-(]/, "").replace(/\)$/, "");
  if (!/^[\d.,]+$/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // o ultimo separador e o decimal; o outro e milhar
    normalized = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // somente virgula: decimal brasileiro (uma unica virgula) ou milhar americano (grupos de 3)
    const commaCount = (s.match(/,/g) ?? []).length;
    if (commaCount === 1) {
      normalized = s.replace(",", ".");
    } else if (/^\d{1,3}(,\d{3})+$/.test(s)) {
      normalized = s.replace(/,/g, "");
    } else {
      return null;
    }
  } else if (lastDot >= 0) {
    // somente ponto: milhar brasileiro em grupos de 3 (1.234 / 1.234.567) ou decimal americano
    const dotCount = (s.match(/\./g) ?? []).length;
    if (dotCount === 1) {
      normalized = /^\d{1,3}\.\d{3}$/.test(s) ? s.replace(".", "") : s;
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      normalized = s.replace(/\./g, "");
    } else {
      return null;
    }
  } else {
    normalized = s;
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = new Decimal(normalized);
  return negative ? value.negated() : value;
}

/** Schema Zod: texto/numero -> string decimal canonica ("1234.56"). */
export const decimalInput = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const parsed = parseDecimalInput(v);
  if (parsed === null) {
    ctx.addIssue({ code: "custom", message: "Informe um número válido." });
    return z.NEVER;
  }
  return parsed.toFixed();
});

export const nonNegativeDecimalInput = decimalInput.refine(
  (v) => new Decimal(v).gte(0),
  "O valor não pode ser negativo.",
);

export const positiveDecimalInput = decimalInput.refine(
  (v) => new Decimal(v).gt(0),
  "O valor deve ser maior que zero.",
);
