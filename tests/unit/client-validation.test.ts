import { describe, expect, it } from "vitest";
import { clientSchema, contactSchema, contractSchema } from "@/lib/validation/client";

const base = {
  code: "abc",
  legalName: "Empresa Teste Ltda",
  tradeName: "Teste",
  cnpj: "11.222.333/0001-81",
};

describe("clientSchema", () => {
  it("normaliza código, CNPJ e campos vazios", () => {
    const r = clientSchema.parse({ ...base, email: "", phone: " ", notes: "" });
    expect(r.code).toBe("ABC");
    expect(r.cnpj).toBe("11222333000181");
    expect(r.email).toBeNull();
    expect(r.phone).toBeNull();
  });
  it("rejeita CNPJ inválido com mensagem em pt-BR", () => {
    const r = clientSchema.safeParse({ ...base, cnpj: "11.222.333/0001-82" });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.issues.find((i) => i.path[0] === "cnpj")?.message).toBe("CNPJ inválido.");
  });
  it("rejeita CNPJ repetido e código com caracteres inválidos", () => {
    expect(clientSchema.safeParse({ ...base, cnpj: "11111111111111" }).success).toBe(false);
    expect(clientSchema.safeParse({ ...base, code: "A B" }).success).toBe(false);
  });
});

describe("contactSchema", () => {
  it("exige e-mail válido e aplica padrões", () => {
    const r = contactSchema.parse({ name: "Ana", email: "ANA@X.COM" });
    expect(r.email).toBe("ana@x.com");
    expect(r.isApprover).toBe(false);
    expect(r.isActive).toBe(true);
    expect(contactSchema.safeParse({ name: "Ana", email: "x" }).success).toBe(false);
  });
});

describe("contractSchema", () => {
  const c = { code: "ct-1", name: "Perfuração", unit: "Mina", startDate: "2026-01-10" };
  it("aceita término vazio e rejeita término antes do início", () => {
    expect(contractSchema.parse({ ...c, endDate: "" }).endDate).toBeNull();
    const r = contractSchema.safeParse({ ...c, endDate: "2025-12-31" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["endDate"]);
  });
  it("rejeita data inválida", () => {
    expect(contractSchema.safeParse({ ...c, startDate: "10/01/2026" }).success).toBe(false);
  });
});
