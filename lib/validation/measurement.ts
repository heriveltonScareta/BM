import { z } from "zod";
import "./locale";
import { MeasurementStatus } from "@/lib/db/generated/enums";
import { idSchema, dateOnlySchema } from "./common";
import { nonNegativeDecimalInput } from "./money";
import { parseCompetence } from "@/lib/utils/dates";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .nullish()
    .transform((v) => (v ? v : null));

/** Competencia digitada como MM/AAAA (ou AAAA-MM); armazenada como AAAA-MM. */
export const competenceInputSchema = z
  .string()
  .trim()
  .min(1, "Informe a competência.")
  .transform((v, ctx) => {
    const parsed = parseCompetence(v);
    if (!parsed) {
      ctx.addIssue({ code: "custom", message: "Competência inválida (use MM/AAAA)." });
      return z.NEVER;
    }
    return parsed;
  });

const amountField = nonNegativeDecimalInput.default("0");

export const measurementHeaderSchema = z
  .object({
    contractId: idSchema,
    competence: competenceInputSchema,
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    issueDate: dateOnlySchema,
    frs: optionalText(40),
    purchaseOrder: optionalText(40),
    notes: optionalText(4000),
    otherAmount: amountField,
    discountAmount: amountField,
    additionAmount: amountField,
    taxAmount: amountField,
  })
  .refine((v) => v.endDate >= v.startDate, {
    path: ["endDate"],
    message: "O fim do período deve ser igual ou posterior ao início.",
  });
export type MeasurementHeaderInput = z.input<typeof measurementHeaderSchema>;
export type MeasurementHeaderData = z.output<typeof measurementHeaderSchema>;

export const createMeasurementSchema = z
  .object({
    clientId: idSchema,
    contractId: idSchema,
    competence: competenceInputSchema,
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    issueDate: dateOnlySchema,
    frs: optionalText(40),
    purchaseOrder: optionalText(40),
    notes: optionalText(4000),
  })
  .refine((v) => v.endDate >= v.startDate, {
    path: ["endDate"],
    message: "O fim do período deve ser igual ou posterior ao início.",
  });
export type CreateMeasurementInput = z.input<typeof createMeasurementSchema>;
export type CreateMeasurementData = z.output<typeof createMeasurementSchema>;

const itemBase = {
  code: z.string().trim().min(1, "Informe o código.").max(30, "Máximo de 30 caracteres."),
  description: optionalText(240),
  quantity: nonNegativeDecimalInput,
  unit: z.string().trim().min(1, "Informe a unidade.").max(12, "Máximo de 12 caracteres."),
  daysHours: nonNegativeDecimalInput.default("0"),
  unitPrice: nonNegativeDecimalInput,
};

export const laborItemSchema = z.object({
  ...itemBase,
  role: z.string().trim().min(1, "Informe a função.").max(120, "Máximo de 120 caracteres."),
});
export const equipmentItemSchema = z.object({
  ...itemBase,
  name: z.string().trim().min(1, "Informe o equipamento.").max(120, "Máximo de 120 caracteres."),
});
export type LaborItemInput = z.input<typeof laborItemSchema>;
export type LaborItemData = z.output<typeof laborItemSchema>;
export type EquipmentItemInput = z.input<typeof equipmentItemSchema>;
export type EquipmentItemData = z.output<typeof equipmentItemSchema>;

export const ITEM_KINDS = ["mao-de-obra", "equipamentos"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const itemKindSchema = z.enum(ITEM_KINDS);

export const reorderSchema = z.object({ ids: z.array(idSchema).min(1) });

export const transitionSchema = z.object({
  to: z.enum(MeasurementStatus),
  reason: z.string().trim().max(1000).optional(),
});

export const MEASUREMENT_SORT_FIELDS = [
  "number",
  "competence",
  "issueDate",
  "status",
  "totalAmount",
  "updatedAt",
  "client",
] as const;

export const measurementListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(MEASUREMENT_SORT_FIELDS).default("updatedAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  status: z.enum(MeasurementStatus).optional(),
  /** Lista separada por virgula (ex.: fila de aprovacoes). Ignora valores invalidos. */
  statuses: z
    .string()
    .optional()
    .transform((v) => {
      const valid = new Set<string>(Object.values(MeasurementStatus));
      const list = (v ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter((x) => valid.has(x)) as MeasurementStatus[];
      return list.length ? list : undefined;
    }),
  clientId: idSchema.optional(),
  competence: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? (parseCompetence(v) ?? undefined) : undefined)),
});
export type MeasurementListQuery = Omit<
  z.output<typeof measurementListQuerySchema>,
  "competence" | "statuses"
> & {
  competence?: string;
  statuses?: MeasurementStatus[];
};
