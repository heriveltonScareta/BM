import { describe, expect, it } from "vitest";
import { MeasurementStatus as S, Role } from "@/lib/db/generated/enums";
import { can, type SessionUser } from "@/lib/auth/rbac";
import { getScope, measurementScopeWhere } from "@/lib/auth/scope";

const user = (role: Role, clientId: string | null = null): SessionUser => ({
  id: "u",
  name: "Teste",
  email: "t@t",
  role,
  clientId,
});

describe("can — matriz da Seção 6", () => {
  it("gerenciar usuários e clientes: só Admin", () => {
    expect(can(user(Role.ADMIN), "usuarios:gerenciar")).toBe(true);
    expect(can(user(Role.OPERACIONAL), "usuarios:gerenciar")).toBe(false);
    expect(can(user(Role.FINANCEIRO), "clientes:gerenciar")).toBe(false);
    expect(can(user(Role.CLIENTE, "c1"), "clientes:gerenciar")).toBe(false);
  });
  it("criar/editar medição: Admin e Operacional", () => {
    expect(can(user(Role.OPERACIONAL), "medicao:criar")).toBe(true);
    expect(can(user(Role.FINANCEIRO), "medicao:criar")).toBe(false);
    expect(can(user(Role.CLIENTE, "c1"), "medicao:editar")).toBe(false);
  });
  it("enviar e cancelar: só Admin", () => {
    expect(can(user(Role.ADMIN), "medicao:enviar")).toBe(true);
    expect(can(user(Role.OPERACIONAL), "medicao:enviar")).toBe(false);
    expect(can(user(Role.OPERACIONAL), "medicao:cancelar")).toBe(false);
  });
  it("faturamento: Admin e Financeiro", () => {
    expect(can(user(Role.FINANCEIRO), "faturamento:gerenciar")).toBe(true);
    expect(can(user(Role.OPERACIONAL), "faturamento:gerenciar")).toBe(false);
  });
  it("relatório financeiro consolidado não é do Operacional", () => {
    expect(can(user(Role.OPERACIONAL), "relatorios:ver")).toBe(true);
    expect(can(user(Role.OPERACIONAL), "relatorios:financeiro")).toBe(false);
  });
  it("auditoria: só Admin", () => {
    expect(can(user(Role.ADMIN), "auditoria:ver")).toBe(true);
    expect(can(user(Role.FINANCEIRO), "auditoria:ver")).toBe(false);
  });
  it("Financeiro vê medições apenas de APROVADO em diante", () => {
    const f = user(Role.FINANCEIRO);
    expect(can(f, "medicao:ver", { status: S.APROVADO })).toBe(true);
    expect(can(f, "medicao:ver", { status: S.FATURADO })).toBe(true);
    expect(can(f, "medicao:ver", { status: S.EM_ELABORACAO })).toBe(false);
    expect(can(f, "medicao:ver", { status: S.CORRECAO_SOLICITADA })).toBe(false);
  });
  it("Cliente só vê o próprio cliente e a partir do envio", () => {
    const c = user(Role.CLIENTE, "c1");
    expect(can(c, "medicao:ver", { clientId: "c1", status: S.ENVIADO_AO_CLIENTE })).toBe(true);
    expect(can(c, "medicao:ver", { clientId: "c2", status: S.ENVIADO_AO_CLIENTE })).toBe(false);
    expect(can(c, "medicao:ver", { clientId: "c1", status: S.RASCUNHO })).toBe(false);
    expect(can(user(Role.CLIENTE, null), "medicao:ver")).toBe(false);
  });
  it("sem usuário nunca pode", () => {
    expect(can(null, "medicao:ver")).toBe(false);
  });
});

describe("getScope — derivado só da sessão", () => {
  it("Admin/Operacional: tudo", () => {
    expect(getScope(user(Role.ADMIN))).toEqual({ kind: "ALL" });
    expect(measurementScopeWhere(getScope(user(Role.OPERACIONAL)))).toEqual({ deletedAt: null });
  });
  it("Cliente: filtra por clientId e status visíveis", () => {
    const where = measurementScopeWhere(getScope(user(Role.CLIENTE, "c1")));
    expect(where.clientId).toBe("c1");
    expect(where.status).toBeDefined();
  });
  it("Cliente sem clientId não enxerga nada", () => {
    const where = measurementScopeWhere(getScope(user(Role.CLIENTE, null)));
    expect(where.clientId).toBe("__sem_cliente__");
  });
});
