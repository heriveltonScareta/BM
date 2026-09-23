import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { EmailMessage, EmailProvider } from "./types";

/**
 * Provedor de desenvolvimento: grava o e-mail em disco (.eml) e loga o conteudo,
 * incluindo qualquer link, no console. O sistema funciona 100% sem SMTP.
 */
export function createDevEmailProvider(options: { dir: string; from: string }): EmailProvider {
  return {
    name: "dev",
    async send(message: EmailMessage) {
      const id = randomUUID();
      await mkdir(options.dir, { recursive: true });
      const file = path.join(
        options.dir,
        `${new Date().toISOString().replace(/[:.]/g, "-")}-${id}.eml`,
      );
      const content = [
        `From: ${options.from}`,
        `To: ${message.to}`,
        `Subject: ${message.subject}`,
        `Date: ${new Date().toUTCString()}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        message.text,
      ].join("\n");
      await writeFile(file, content, "utf8");
      const links = message.text.match(/https?:\/\/\S+/g) ?? [];
      console.info(
        `[email:dev] "${message.subject}" para ${message.to} gravado em ${file}` +
          (links.length ? `\n[email:dev] links: ${links.join(" ")}` : ""),
      );
      return { id };
    },
  };
}
