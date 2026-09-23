/**
 * Configuracao central lida das variaveis de ambiente.
 * Unico lugar que le process.env (fora do prisma.config.ts e do seed).
 */
function env(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

export const config = {
  appUrl: env("APP_URL", "http://localhost:3000"),
  timezone: env("APP_TIMEZONE", "America/Sao_Paulo"),
  sessionMaxAge: Number(env("SESSION_MAX_AGE", "28800")),
  company: {
    name: env("COMPANY_NAME", "Prestadora Demo Ltda"),
    cnpj: env("COMPANY_CNPJ", "12345678000195"),
    email: env("COMPANY_EMAIL", "contato@prestadora.demo"),
  },
  storage: {
    provider: env("STORAGE_PROVIDER", "local") as "local" | "s3",
    localDir: env("STORAGE_LOCAL_DIR", "./storage"),
  },
  email: {
    provider: env("EMAIL_PROVIDER", "dev") as "dev" | "smtp",
    devDir: env("EMAIL_DEV_DIR", "/tmp/bm-emails"),
    from: env("EMAIL_FROM", "Medicoes <nao-responda@prestadora.demo>"),
    smtp: {
      host: process.env.SMTP_HOST ?? "",
      port: Number(process.env.SMTP_PORT ?? "587"),
      secure: process.env.SMTP_SECURE === "true",
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASS ?? "",
    },
  },
  approval: {
    tokenTtlDays: 7,
  },
  passwordReset: {
    tokenTtlMinutes: 60,
  },
} as const;
