import { config } from "@/lib/config";
import { createDevEmailProvider } from "./dev";
import { createSmtpEmailProvider } from "./smtp";
import type { EmailProvider } from "./types";

export type { EmailMessage, EmailProvider } from "./types";

const globalRef = globalThis as unknown as { __bmEmail?: EmailProvider };

export function getEmailProvider(): EmailProvider {
  if (globalRef.__bmEmail) return globalRef.__bmEmail;
  const provider =
    config.email.provider === "smtp" && config.email.smtp.host
      ? createSmtpEmailProvider({ ...config.email.smtp, from: config.email.from })
      : createDevEmailProvider({ dir: config.email.devDir, from: config.email.from });
  globalRef.__bmEmail = provider;
  return provider;
}

/** Permite injetar um provedor falso nos testes. */
export function setEmailProviderForTests(provider: EmailProvider | undefined): void {
  globalRef.__bmEmail = provider;
}
