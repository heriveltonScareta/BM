import { prisma } from "@/lib/db/prisma";
import type { ReportFilters } from "@/lib/validation/report";
import { STATUS_LABELS } from "@/lib/services/status-machine";
import { formatCompetence } from "@/lib/utils/dates";

/** Texto legivel dos filtros aplicados (cabecalho das exportacoes). */
export async function describeFilters(f: ReportFilters): Promise<string> {
  const parts: string[] = [];
  if (f.de || f.ate)
    parts.push(
      `competência ${f.de ? formatCompetence(f.de) : "…"} a ${f.ate ? formatCompetence(f.ate) : "…"}`,
    );
  if (f.clientId) {
    const c = await prisma.client.findUnique({
      where: { id: f.clientId },
      select: { tradeName: true },
    });
    if (c) parts.push(`cliente ${c.tradeName}`);
  }
  if (f.statuses?.length)
    parts.push(`status ${f.statuses.map((s) => STATUS_LABELS[s]).join(", ")}`);
  return parts.length ? parts.join(" · ") : "sem filtros";
}
