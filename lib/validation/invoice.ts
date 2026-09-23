import { z } from "zod";
import "./locale";
import { InvoiceStatus, DocumentType } from "@/lib/db/generated/enums";
import { dateOnlySchema, idSchema } from "./common";
import { positiveDecimalInput } from "./money";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .nullish()
    .transform((v) => (v ? v : null));

export const invoiceSchema = z.object({
  number: z
    .string()
    .trim()
    .min(1, "Informe o número da nota fiscal.")
    .max(30, "Máximo de 30 caracteres."),
  series: optionalText(10),
  issueDate: dateOnlySchema,
  amount: positiveDecimalInput,
  notes: optionalText(1000),
});
export type InvoiceInput = z.input<typeof invoiceSchema>;
export type InvoiceData = z.output<typeof invoiceSchema>;

export const invoiceStatusSchema = z.object({
  status: z.enum(InvoiceStatus),
  sentAt: dateOnlySchema.nullish().transform((v) => (v ? v : null)),
  notes: optionalText(1000),
});
export type InvoiceStatusData = z.output<typeof invoiceStatusSchema>;

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  EMITIDA: "Emitida",
  ENVIADA: "Enviada ao cliente",
  PAGA: "Paga",
  CANCELADA: "Cancelada",
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  BOLETIM: "Boletim",
  BOLETIM_ASSINADO: "Boletim assinado",
  NF_PDF: "Nota fiscal (PDF)",
  NF_XML: "Nota fiscal (XML)",
  OUTRO: "Outro",
};

/** Limites de upload (Secao 13). */
export const UPLOAD_LIMITS = {
  pdf: 20 * 1024 * 1024,
  xml: 20 * 1024 * 1024,
  png: 5 * 1024 * 1024,
  jpeg: 5 * 1024 * 1024,
} as const;

export const documentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(["createdAt", "fileName", "type", "sizeBytes"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  type: z.enum(DocumentType).optional(),
  clientId: idSchema.optional(),
});
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;
