import { z } from "zod";
import "./locale";
import { MeasurementStatus } from "@/lib/db/generated/enums";
import { idSchema } from "./common";
import { parseCompetence } from "@/lib/utils/dates";

const competenceParam = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? (parseCompetence(v) ?? undefined) : undefined));

const statusesParam = z
  .string()
  .optional()
  .transform((v) => {
    const valid = new Set<string>(Object.values(MeasurementStatus));
    const list = (v ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter((x) => valid.has(x)) as MeasurementStatus[];
    return list.length ? list : undefined;
  });

export const REPORT_TYPES = ["medicoes", "financeiro", "faturamento"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const reportFiltersSchema = z.object({
  tipo: z.enum(REPORT_TYPES).default("medicoes"),
  de: competenceParam,
  ate: competenceParam,
  clientId: idSchema.optional(),
  statuses: statusesParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z
    .enum(["number", "competence", "client", "totalAmount", "status", "updatedAt"])
    .default("competence"),
  order: z.enum(["asc", "desc"]).default("desc"),
});
export type ReportFilters = Omit<
  z.output<typeof reportFiltersSchema>,
  "de" | "ate" | "statuses"
> & {
  de?: string;
  ate?: string;
  statuses?: MeasurementStatus[];
};

export const exportFormatSchema = z.enum(["xlsx", "pdf"]);

export const dashboardQuerySchema = z.object({
  competence: competenceParam,
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2, "Digite ao menos 2 caracteres.").max(80),
});
