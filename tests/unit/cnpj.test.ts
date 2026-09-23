import { describe, expect, it } from "vitest";
import { formatCnpj, isValidCnpj, maskCnpj } from "@/lib/validation/cnpj";

describe("isValidCnpj", () => {
  it("aceita CNPJs válidos com e sem máscara", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
    expect(isValidCnpj("04.252.011/0001-10")).toBe(true);
    expect(isValidCnpj("00.000.000/0001-91")).toBe(true); // Banco do Brasil
  });

  it("rejeita dígitos verificadores errados", () => {
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("11222333000180")).toBe(false);
    expect(isValidCnpj("04252011000111")).toBe(false);
  });

  it("rejeita sequências repetidas", () => {
    for (const d of "0123456789") expect(isValidCnpj(d.repeat(14))).toBe(false);
  });

  it("rejeita tamanho errado, vazio e lixo", () => {
    expect(isValidCnpj("")).toBe(false);
    expect(isValidCnpj("1122233300018")).toBe(false);
    expect(isValidCnpj("112223330001811")).toBe(false);
    expect(isValidCnpj("abc")).toBe(false);
  });
});

describe("formatCnpj / maskCnpj", () => {
  it("formata 14 dígitos", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
  it("máscara progressiva", () => {
    expect(maskCnpj("1")).toBe("1");
    expect(maskCnpj("112")).toBe("11.2");
    expect(maskCnpj("112223")).toBe("11.222.3");
    expect(maskCnpj("1122233300")).toBe("11.222.333/00");
    expect(maskCnpj("11222333000181999")).toBe("11.222.333/0001-81");
  });
});
