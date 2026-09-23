import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { findUserByEmail } from "@/lib/db/repositories/user.repository";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { SessionUser } from "@/lib/auth/rbac";
import { audit } from "@/lib/services/audit.service";
import { getEmailProvider } from "@/lib/email";
import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Autentica por e-mail/senha. Registra LOGIN ou LOGIN_FALHOU na auditoria.
 * Retorna null em qualquer falha (sem revelar se o e-mail existe).
 */
export async function authenticate(
  email: string,
  password: string,
  meta: RequestMeta = {},
): Promise<SessionUser | null> {
  const normalized = email.trim().toLowerCase();
  const user = await findUserByEmail(prisma, normalized);
  const ok = !!user && user.isActive && (await verifyPassword(password, user.passwordHash));

  if (!ok) {
    await audit(prisma, {
      entity: "User",
      entityId: user?.id ?? "desconhecido",
      action: "LOGIN_FALHOU",
      actor: { userId: user?.id ?? null, label: normalized, ...meta },
      after: {
        email: normalized,
        motivo: !user ? "usuario_inexistente" : !user.isActive ? "inativo" : "senha_invalida",
      },
    });
    return null;
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(tx, {
      entity: "User",
      entityId: user.id,
      action: "LOGIN",
      actor: { userId: user.id, label: `${user.name} <${user.email}>`, ...meta },
    });
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    clientId: user.clientId,
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Solicita redefinicao de senha. Sempre responde sucesso (nao revela se o e-mail existe).
 * O token (32 bytes) e enviado por e-mail e apenas seu hash e persistido.
 */
export async function requestPasswordReset(email: string, meta: RequestMeta = {}): Promise<void> {
  const user = await findUserByEmail(prisma, email);
  if (!user || !user.isActive) return;

  const token = generateToken();
  const expiresAt = new Date(Date.now() + config.passwordReset.tokenTtlMinutes * 60_000);
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
  });

  const link = `${config.appUrl}/recuperar-senha/${token}`;
  await getEmailProvider().send({
    to: user.email,
    subject: "Redefinição de senha",
    text: [
      `Olá, ${user.name}.`,
      "",
      "Recebemos um pedido para redefinir a sua senha. Acesse o link abaixo para criar uma nova senha:",
      link,
      "",
      `O link expira em ${config.passwordReset.tokenTtlMinutes} minutos. Se você não fez este pedido, ignore este e-mail.`,
    ].join("\n"),
  });
  void meta;
}

export async function resetPassword(
  token: string,
  newPassword: string,
  meta: RequestMeta = {},
): Promise<void> {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt < new Date() || !record.user.isActive) {
    throw new AppError(
      "Link inválido ou expirado. Solicite uma nova redefinição.",
      400,
      "INVALID_TOKEN",
    );
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await audit(tx, {
      entity: "User",
      entityId: record.userId,
      action: "SENHA_REDEFINIDA",
      actor: {
        userId: record.userId,
        label: `${record.user.name} <${record.user.email}>`,
        ...meta,
      },
    });
  });
}
