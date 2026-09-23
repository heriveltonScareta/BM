import { z } from "zod";

export const idSchema = z.string().uuid("Identificador inválido.");

/** Competencia no formato AAAA-MM (armazenamento). */
export const competenceSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência inválida (use MM/AAAA).");

/** Data ISO (AAAA-MM-DD). */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), "Data inválida.");

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().max(60).optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
  q: z.string().trim().max(120).optional(),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
