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

describe("limites de escala e magnitude (fase 7)", async () => {
  const { itemDecimalInput, positiveDecimalInput, nonNegativeDecimalInput } =
    await import("@/lib/validation/money");
  const { formatUnitPrice } = await import("@/lib/utils/format");
  it("itens: até 4 casas e abaixo de 1e12", () => {
    expect(itemDecimalInput.parse("1,0005")).toBe("1.0005");
    expect(itemDecimalInput.safeParse("1,00005").success).toBe(false);
    expect(itemDecimalInput.safeParse("1000000000000").success).toBe(false);
    expect(itemDecimalInput.safeParse("-1").success).toBe(false);
    // ruido binario de celula numerica e removido antes da validacao
    expect(itemDecimalInput.parse(0.1 + 0.2)).toBe("0.3");
  });
  it("dinheiro: até 2 casas e abaixo de 1e14; positivo quando exigido", () => {
    expect(nonNegativeDecimalInput.parse("0")).toBe("0");
    expect(nonNegativeDecimalInput.safeParse("12,345").success).toBe(false);
    expect(positiveDecimalInput.safeParse("0").success).toBe(false);
    expect(positiveDecimalInput.safeParse("100000000000000").success).toBe(false);
  });
  it("formatCurrency é exato acima de 2^53 e formatUnitPrice mostra as casas gravadas", () => {
    const plain = (s: string) => s.replace(/\u00a0/g, " ");
    expect(plain(formatCurrency("9999999999999999.99"))).toBe("R$ 9.999.999.999.999.999,99");
    expect(plain(formatCurrency("0.005"))).toBe("R$ 0,01");
    expect(plain(formatUnitPrice("10.005"))).toBe("R$ 10,005");
    expect(plain(formatUnitPrice("62.5"))).toBe("R$ 62,50");
    expect(plain(formatUnitPrice("1.2345"))).toBe("R$ 1,2345");
  });
});
