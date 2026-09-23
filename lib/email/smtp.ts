import nodemailer from "nodemailer";
import type { EmailMessage, EmailProvider } from "./types";

export interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export function createSmtpEmailProvider(options: SmtpOptions): EmailProvider {
  const transport = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: options.user ? { user: options.user, pass: options.pass } : undefined,
  });
  return {
    name: "smtp",
    async send(message: EmailMessage) {
      const info = await transport.sendMail({
        from: options.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return { id: info.messageId };
    },
  };
}
