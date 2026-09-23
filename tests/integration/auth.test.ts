import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../setup/db";
import { hashPassword } from "@/lib/auth/password";
import { authenticate, requestPasswordReset, resetPassword } from "@/lib/services/auth.service";
import { Role } from "@/lib/db/generated/enums";
import { setEmailProviderForTests, type EmailMessage } from "@/lib/email";

describe("autenticação com auditoria", () => {
  const sent: EmailMessage[] = [];

  beforeAll(async () => {
    await resetDatabase();
    setEmailProviderForTests({
      name: "fake",
      async send(m) {
        sent.push(m);
        return { id: "1" };
      },
    });
    const passwordHash = await hashPassword("Senha@123");
    await prisma.user.createMany({
      data: [
        { name: "Ativo", email: "ativo@t.local", passwordHash, role: Role.ADMIN },
        {
          name: "Inativo",
          email: "inativo@t.local",
          passwordHash,
          role: Role.OPERACIONAL,
          isActive: false,
        },
      ],
    });
  });

  afterAll(async () => {
    setEmailProviderForTests(undefined);
    await prisma.$disconnect();
  });

  it("login correto retorna o usuário, grava lastLoginAt e registra LOGIN", async () => {
    const user = await authenticate("Ativo@T.local", "Senha@123", {
      ip: "10.0.0.1",
      userAgent: "vitest",
    });
    expect(user).toMatchObject({ email: "ativo@t.local", role: Role.ADMIN, clientId: null });
    const db = await prisma.user.findUnique({ where: { email: "ativo@t.local" } });
    expect(db?.lastLoginAt).toBeInstanceOf(Date);
    const log = await prisma.auditLog.findFirst({ where: { action: "LOGIN", entityId: user!.id } });
    expect(log?.ip).toBe("10.0.0.1");
    expect(log?.actorUserId).toBe(user!.id);
  });

  it("senha errada retorna null e registra LOGIN_FALHOU", async () => {
    expect(await authenticate("ativo@t.local", "errada")).toBeNull();
    const log = await prisma.auditLog.findFirst({
      where: { action: "LOGIN_FALHOU", actorLabel: "ativo@t.local" },
      orderBy: { createdAt: "desc" },
    });
    expect(log?.after).toMatchObject({ motivo: "senha_invalida" });
  });

  it("usuário inativo e inexistente são rejeitados sem revelar o motivo ao chamador", async () => {
    expect(await authenticate("inativo@t.local", "Senha@123")).toBeNull();
    expect(await authenticate("naoexiste@t.local", "Senha@123")).toBeNull();
    const logs = await prisma.auditLog.findMany({ where: { action: "LOGIN_FALHOU" } });
    expect(logs.map((l) => (l.after as { motivo: string }).motivo).sort()).toEqual([
      "inativo",
      "senha_invalida",
      "usuario_inexistente",
    ]);
  });

  it("recuperação de senha: token de uso único, hash no banco, senha trocada", async () => {
    await requestPasswordReset("ativo@t.local");
    await requestPasswordReset("naoexiste@t.local"); // silencioso
    expect(sent).toHaveLength(1);
    const link = sent[0]!.text.match(/https?:\/\/\S+/)?.[0] ?? "";
    const token = link.split("/").pop()!;
    expect(token.length).toBeGreaterThanOrEqual(43); // 32 bytes em base64url

    const stored = await prisma.passwordResetToken.findFirst();
    expect(stored?.tokenHash).not.toBe(token);

    await resetPassword(token, "NovaSenha@456");
    expect(await authenticate("ativo@t.local", "Senha@123")).toBeNull();
    expect(await authenticate("ativo@t.local", "NovaSenha@456")).not.toBeNull();

    await expect(resetPassword(token, "Outra@789")).rejects.toThrow(/inválido ou expirado/);
    await expect(
      resetPassword("token-inexistente-xxxxxxxxxxxxxxxxxxxxxx", "Outra@789"),
    ).rejects.toThrow();
  });
});
