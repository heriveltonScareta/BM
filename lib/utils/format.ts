import Decimal from "decimal.js";

export type DecimalLike = Decimal | string | number | { toString(): string };

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function toNumber(value: DecimalLike | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return new Decimal(value.toString()).toNumber();
}

/**
 * Representacao decimal exata para o Intl (aceita string numerica; evita o double e mantem
 * os centavos mesmo acima de 2^53).
 */
function toExact(value: DecimalLike | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const d = new Decimal(value.toString());
  return (d.isFinite() ? d.toFixed() : "0") as unknown as number;
}

/** R$ 1.234.567,89 */
export function formatCurrency(value: DecimalLike | null | undefined): string {
  return currencyFormatter.format(toExact(value));
}

const unitPriceFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** Valor unitario com as casas realmente gravadas (2 a 4): R$ 10,005 nunca aparece como R$ 10,01. */
export function formatUnitPrice(value: DecimalLike | null | undefined): string {
  return unitPriceFormatter.format(toExact(value));
}

/** 1.234,56 (sem simbolo) */
export function formatNumber(value: DecimalLike | null | undefined, decimals = 2): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(toNumber(value));
}

/** Quantidades: ate 4 casas, sem zeros a direita desnecessarios (min 0). */
export function formatQuantity(value: DecimalLike | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(toNumber(value));
}

/** 12345 bytes -> "12,1 KB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${formatNumber(v, 1)} ${units[i]}`;
}
