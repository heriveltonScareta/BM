import { z } from "zod";
import "./locale";
import { idSchema } from "./common";

export const sendSchema = z.object({
  contactId: idSchema.optional(),
});

export const decisionSchema = z
  .object({
    decision: z.enum(["APROVAR", "CORRIGIR"]),
    comment: z.string().trim().max(2000, "Máximo de 2000 caracteres.").optional().default(""),
  })
  .refine((v) => v.decision === "APROVAR" || v.comment.length >= 5, {
    path: ["comment"],
    message: "Descreva o que precisa ser corrigido (mínimo de 5 caracteres).",
  });
export type DecisionInput = z.input<typeof decisionSchema>;
export type DecisionData = z.output<typeof decisionSchema>;

export const signSchema = z.object({
  signerName: z
    .string()
    .trim()
    .min(3, "Informe seu nome completo.")
    .max(120, "Máximo de 120 caracteres."),
  accepted: z.literal(true, { message: "É necessário declarar ciência para assinar." }),
});
export type SignInput = z.input<typeof signSchema>;
export type SignData = z.output<typeof signSchema>;

/** Token do portal: 32 bytes em base64url (43 caracteres). */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{40,64}$/, "Link inválido.");

export const compareQuerySchema = z.object({
  a: z.coerce.number().int().min(1),
  b: z.coerce.number().int().min(1),
});
