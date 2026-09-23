import Decimal from "decimal.js";

/**
 * Regras de calculo (Secao 8 do briefing). Funcoes puras sobre Decimal.
 * Todo arredondamento e half-up a 2 casas e acontece aqui, no servidor.
 */
const ROUNDING = Decimal.ROUND_HALF_UP;

export type DecimalInput = Decimal | string | number;

export function toDecimal(value: DecimalInput | null | undefined): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  return value instanceof Decimal ? value : new Decimal(value);
}

/** Arredonda a 2 casas, half-up. */
export function round2(value: DecimalInput): Decimal {
  return toDecimal(value).toDecimalPlaces(2, ROUNDING);
}

/** totalPrice do item = quantity x unitPrice, arredondado a 2 casas na gravacao. */
export function computeItemTotal(quantity: DecimalInput, unitPrice: DecimalInput): Decimal {
  return round2(toDecimal(quantity).times(toDecimal(unitPrice)));
}

export interface ItemLike {
  totalPrice: DecimalInput;
}

export interface TotalsInput {
  laborItems: ItemLike[];
  equipmentItems: ItemLike[];
  otherAmount?: DecimalInput | null;
  discountAmount?: DecimalInput | null;
  additionAmount?: DecimalInput | null;
  taxAmount?: DecimalInput | null;
}

export interface Totals {
  laborTotal: Decimal;
  equipmentTotal: Decimal;
  otherAmount: Decimal;
  subtotal: Decimal;
  discountAmount: Decimal;
  additionAmount: Decimal;
  taxAmount: Decimal;
  totalAmount: Decimal;
}

function sumTotals(items: ItemLike[]): Decimal {
  return items.reduce((acc, item) => acc.plus(round2(item.totalPrice)), new Decimal(0));
}

/**
 * Total Mao de Obra = soma dos LaborItem.totalPrice
 * Total Equipamentos = soma dos EquipmentItem.totalPrice
 * Subtotal = Mao de Obra + Equipamentos + Outros
 * Total da Medicao = Subtotal - Descontos + Acrescimos + Impostos
 */
export function computeTotals(input: TotalsInput): Totals {
  const laborTotal = round2(sumTotals(input.laborItems));
  const equipmentTotal = round2(sumTotals(input.equipmentItems));
  const otherAmount = round2(toDecimal(input.otherAmount));
  const discountAmount = round2(toDecimal(input.discountAmount));
  const additionAmount = round2(toDecimal(input.additionAmount));
  const taxAmount = round2(toDecimal(input.taxAmount));
  const subtotal = round2(laborTotal.plus(equipmentTotal).plus(otherAmount));
  const totalAmount = round2(subtotal.minus(discountAmount).plus(additionAmount).plus(taxAmount));
  return {
    laborTotal,
    equipmentTotal,
    otherAmount,
    subtotal,
    discountAmount,
    additionAmount,
    taxAmount,
    totalAmount,
  };
}

/** Converte Totals para strings canonicas (para gravar/serializar). */
export function totalsToStrings(t: Totals): Record<keyof Totals, string> {
  return {
    laborTotal: t.laborTotal.toFixed(2),
    equipmentTotal: t.equipmentTotal.toFixed(2),
    otherAmount: t.otherAmount.toFixed(2),
    subtotal: t.subtotal.toFixed(2),
    discountAmount: t.discountAmount.toFixed(2),
    additionAmount: t.additionAmount.toFixed(2),
    taxAmount: t.taxAmount.toFixed(2),
    totalAmount: t.totalAmount.toFixed(2),
  };
}
