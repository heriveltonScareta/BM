import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { computeItemTotal, computeTotals, round2 } from "@/lib/services/calculation";

describe("computeItemTotal", () => {
  it("multiplica quantidade por valor unitário com arredondamento half-up a 2 casas", () => {
    expect(computeItemTotal("3", "10.005").toFixed(2)).toBe("30.02"); // 30.015 -> 30.02
    expect(computeItemTotal("1", "2.345").toFixed(2)).toBe("2.35");
    expect(computeItemTotal("1", "2.344").toFixed(2)).toBe("2.34");
    expect(computeItemTotal("176.5", "48.90").toFixed(2)).toBe("8630.85");
  });

  it("não sofre com erro de ponto flutuante", () => {
    // 0.1 * 3 em float = 0.30000000000000004
    expect(computeItemTotal("0.1", "3").toFixed(2)).toBe("0.30");
    expect(computeItemTotal("1.1", "1.1").toFixed(2)).toBe("1.21");
    // 4.35 * 100 em float = 434.99999999999994
    expect(computeItemTotal("100", "4.35").toFixed(2)).toBe("435.00");
  });

  it("aceita quantidades com até 6 casas", () => {
    expect(computeItemTotal("0.333333", "3").toFixed(2)).toBe("1.00");
    expect(computeItemTotal("1234.567891", "0.01").toFixed(2)).toBe("12.35");
  });
});

describe("round2", () => {
  it("arredonda half-up (não bancário)", () => {
    expect(round2("2.125").toFixed(2)).toBe("2.13");
    expect(round2("2.135").toFixed(2)).toBe("2.14");
    expect(round2("-2.125").toFixed(2)).toBe("-2.13");
  });
});

describe("computeTotals", () => {
  it("soma mão de obra, equipamentos e outros e aplica descontos, acréscimos e impostos", () => {
    const t = computeTotals({
      laborItems: [{ totalPrice: "100.10" }, { totalPrice: "200.20" }],
      equipmentItems: [{ totalPrice: "50.05" }],
      otherAmount: "10",
      discountAmount: "25.5",
      additionAmount: "5.25",
      taxAmount: "12.345",
    });
    expect(t.laborTotal.toFixed(2)).toBe("300.30");
    expect(t.equipmentTotal.toFixed(2)).toBe("50.05");
    expect(t.subtotal.toFixed(2)).toBe("360.35");
    expect(t.taxAmount.toFixed(2)).toBe("12.35");
    // 360.35 - 25.50 + 5.25 + 12.35
    expect(t.totalAmount.toFixed(2)).toBe("352.45");
  });

  it("trata ausência de itens e campos opcionais como zero", () => {
    const t = computeTotals({ laborItems: [], equipmentItems: [] });
    expect(t.subtotal.toFixed(2)).toBe("0.00");
    expect(t.totalAmount.toFixed(2)).toBe("0.00");
  });

  it("aceita Decimal, string e number como entrada", () => {
    const t = computeTotals({
      laborItems: [{ totalPrice: new Decimal("1.005") }],
      equipmentItems: [{ totalPrice: 2.5 }],
    });
    expect(t.laborTotal.toFixed(2)).toBe("1.01");
    expect(t.equipmentTotal.toFixed(2)).toBe("2.50");
    expect(t.totalAmount.toFixed(2)).toBe("3.51");
  });

  it("soma de muitos itens com centavos quebrados não acumula erro", () => {
    const items = Array.from({ length: 1000 }, () => ({ totalPrice: "0.01" }));
    const t = computeTotals({ laborItems: items, equipmentItems: [] });
    expect(t.laborTotal.toFixed(2)).toBe("10.00");
  });
});
