import { z } from "zod";
import "./locale";
import { isValidCnpj, onlyDigits } from "./cnpj";
import { dateOnlySchema } from "./common";

/** Texto opcional: aceita "", null ou ausente (o formulario ja pode enviar null). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .nullish()
    .transform((v) => (v ? v : null));

export const cnpjSchema = z
  .string()
  .trim()
  .min(1, "Informe o CNPJ.")
  .refine((v) => isValidCnpj(v), "CNPJ inválido.")
  .transform((v) => onlyDigits(v));

export const clientSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Informe um código com pelo menos 2 caracteres.")
    .max(20, "Máximo de 20 caracteres.")
    .regex(/^[A-Za-z0-9-]+$/, "Use apenas letras, números e hífen.")
    .transform((v) => v.toUpperCase()),
  legalName: z
    .string()
    .trim()
    .min(3, "Informe a razão social.")
    .max(160, "Máximo de 160 caracteres."),
  tradeName: z
    .string()
    .trim()
    .min(2, "Informe o nome fantasia.")
    .max(120, "Máximo de 120 caracteres."),
  cnpj: cnpjSchema,
  email: z
    .string()
    .trim()
    .max(160)
    .nullish()
    .transform((v) => (v ? v.toLowerCase() : null))
    .refine(
      (v) => v === null || z.string().email().safeParse(v).success,
      "Informe um e-mail válido.",
    ),
  phone: optionalText(30),
  address: optionalText(240),
  notes: optionalText(2000),
});
export type ClientInput = z.input<typeof clientSchema>;
export type ClientData = z.output<typeof clientSchema>;

export const clientStatusSchema = z.object({ isActive: z.boolean() });

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120, "Máximo de 120 caracteres."),
  role: optionalText(80),
  email: z
    .string()
    .trim()
    .email("Informe um e-mail válido.")
    .max(160)
    .transform((v) => v.toLowerCase()),
  phone: optionalText(30),
  isApprover: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type ContactInput = z.input<typeof contactSchema>;
export type ContactData = z.output<typeof contactSchema>;

export const contractSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, "Informe o código do contrato.")
      .max(40, "Máximo de 40 caracteres.")
      .transform((v) => v.toUpperCase()),
    name: z
      .string()
      .trim()
      .min(3, "Informe o objeto do contrato.")
      .max(160, "Máximo de 160 caracteres."),
    unit: z.string().trim().min(2, "Informe a unidade.").max(120, "Máximo de 120 caracteres."),
    startDate: dateOnlySchema,
    endDate: z
      .string()
      .nullish()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || dateOnlySchema.safeParse(v).success, "Data inválida."),
    isActive: z.boolean().default(true),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    path: ["endDate"],
    message: "A data de término deve ser igual ou posterior ao início.",
  });
export type ContractInput = z.input<typeof contractSchema>;
export type ContractData = z.output<typeof contractSchema>;

export const CLIENT_SORT_FIELDS = [
  "code",
  "tradeName",
  "legalName",
  "cnpj",
  "isActive",
  "createdAt",
  "updatedAt",
] as const;
export type ClientSortField = (typeof CLIENT_SORT_FIELDS)[number];

export const clientListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(CLIENT_SORT_FIELDS).default("tradeName"),
  order: z.enum(["asc", "desc"]).default("asc"),
  status: z.enum(["ativos", "inativos", "todos"]).default("todos"),
});
export type ClientListQuery = z.infer<typeof clientListQuerySchema>;
