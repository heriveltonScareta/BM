import extenso from "extenso";
import Decimal from "decimal.js";

/** "46620.05" -> "Quarenta e seis mil seiscentos e vinte reais e cinco centavos" */
export function valorPorExtenso(value: string | number | Decimal): string {
  const fixed = new Decimal(value.toString()).toFixed(2);
  const text = extenso(fixed, { mode: "currency" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}
