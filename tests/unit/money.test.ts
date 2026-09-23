import { describe, expect, it } from "vitest";
import { parseDecimalInput, decimalInput } from "@/lib/validation/money";
import { formatCurrency, formatNumber, formatQuantity } from "@/lib/utils/format";

describe("parseDecimalInput", () => {
  it("aceita formato brasileiro", () => {
    expect(parseDecimalInput("1.234,56")?.toFixed()).toBe("1234.56");
    expect(parseDecimalInput("1.234.567,89")?.toFixed()).toBe("1234567.89");
    expect(parseDecimalInput("12,5")?.toFixed()).toBe("12.5");
    expect(parseDecimalInput("R$ 1.234,56")?.toFixed()).toBe("1234.56");
    expect(parseDecimalInput("1.234")?.toFixed()).toBe("1234");
  });

  it("aceita formato americano", () => {
    expect(parseDecimalInput("1,234.56")?.toFixed()).toBe("1234.56");
    expect(parseDecimalInput("1234.56")?.toFixed()).toBe("1234.56");
    expect(parseDecimalInput("0.5")?.toFixed()).toBe("0.5");
    expect(parseDecimalInput("12.345678")?.toFixed()).toBe("12.345678");
  });

  it("aceita number e inteiros", () => {
    expect(parseDecimalInput(42)?.toFixed()).toBe("42");
    expect(parseDecimalInput("1000")?.toFixed()).toBe("1000");
    expect(parseDecimalInput("-15,5")?.toFixed()).toBe("-15.5");
  });

  it("rejeita texto e formatos ambíguos", () => {
    expect(parseDecimalInput("abc")).toBeNull();
    expect(parseDecimalInput("")).toBeNull();
    expect(parseDecimalInput("12,34,56")).toBeNull();
    expect(parseDecimalInput("1.2.3")).toBeNull();
    expect(parseDecimalInput(Number.NaN)).toBeNull();
    expect(parseDecimalInput(null)).toBeNull();
  });

  it("schema Zod devolve string canônica e mensagem em pt-BR", () => {
    expect(decimalInput.parse("1.234,5")).toBe("1234.5");
    const r = decimalInput.safeParse("x");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("Informe um número válido.");
  });
});

describe("formatação pt-BR", () => {
  it("moeda", () => {
    expect(formatCurrency("1234567.89").replace(/ /g, " ")).toBe("R$ 1.234.567,89");
    expect(formatCurrency(0).replace(/ /g, " ")).toBe("R$ 0,00");
  });
  it("número e quantidade", () => {
    expect(formatNumber("1234.5")).toBe("1.234,50");
    expect(formatQuantity("176.5")).toBe("176,5");
    expect(formatQuantity("20")).toBe("20");
  });
});
