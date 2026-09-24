import Decimal from "decimal.js";
import { z } from "zod";
import "./locale";

/**
 * Converte texto digitado pelo usuario (ou celula de planilha) em Decimal.
 * Aceita formato brasileiro (1.234,56), americano (1,234.56 / 1234.56) e numero puro.
 * Retorna null quando nao for um numero valido.
 */
export function parseDecimalInput(input: string | number | null | undefined): Decimal | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    // celulas numericas de planilha chegam como double: remove o ruido binario (0.30000000000000004)
    return Number.isFinite(input) ? new Decimal(input).toDecimalPlaces(6) : null;
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

/** Limites de escala/magnitude alinhados as colunas Decimal(18,6) e Decimal(18,2) do banco. */
export const DECIMAL_LIMITS = {
  /** quantidade, dias/horas e valor unitario dos itens */
  item: { maxDecimals: 4, max: "1000000000000" },
  /** valores monetarios de cabecalho, totais e NF */
  money: { maxDecimals: 2, max: "100000000000000" },
} as const;

export function decimalPlacesOf(value: string): number {
  return new Decimal(value).decimalPlaces();
}

/** Schema com escala maxima e magnitude maxima: evita arredondamento silencioso e overflow no banco. */
export function boundedDecimalInput(
  limits: { maxDecimals: number; max: string },
  options: { min?: "zero" | "positive" } = {},
) {
  return decimalInput.superRefine((v, ctx) => {
    const d = new Decimal(v);
    if (options.min === "zero" && d.lt(0))
      ctx.addIssue({ code: "custom", message: "O valor não pode ser negativo." });
    if (options.min === "positive" && d.lte(0))
      ctx.addIssue({ code: "custom", message: "O valor deve ser maior que zero." });
    if (d.decimalPlaces() > limits.maxDecimals)
      ctx.addIssue({
        code: "custom",
        message: `Use no máximo ${limits.maxDecimals} casas decimais.`,
      });
    if (d.abs().gte(limits.max))
      ctx.addIssue({ code: "custom", message: "Valor acima do limite permitido." });
  });
}

export const nonNegativeDecimalInput = boundedDecimalInput(DECIMAL_LIMITS.money, { min: "zero" });
export const positiveDecimalInput = boundedDecimalInput(DECIMAL_LIMITS.money, { min: "positive" });
/** Campos numericos de item (ate 4 casas). */
export const itemDecimalInput = boundedDecimalInput(DECIMAL_LIMITS.item, { min: "zero" });
