import type { Db } from "@/lib/db/prisma";

/**
 * Numeracao BM-AAAA-NNNN segura contra concorrencia.
 *
 * O `upsert` com `where` unico e `create` com o mesmo valor e traduzido pelo Prisma para
 * `INSERT ... ON CONFLICT DO UPDATE`, atomico no Postgres. Chamado dentro da mesma
 * transacao que cria a medicao, o lock da linha do contador serializa criacoes
 * concorrentes ate o commit. Nunca usar count()+1.
 */
export async function nextMeasurementNumber(db: Db, year: number): Promise<string> {
  const counter = await db.measurementCounter.upsert({
    where: { year },
    create: { year, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  });
  return formatMeasurementNumber(year, counter.lastNumber);
}

export function formatMeasurementNumber(year: number, sequence: number): string {
  return `BM-${year}-${String(sequence).padStart(4, "0")}`;
}

export const MEASUREMENT_NUMBER_REGEX = /^BM-\d{4}-\d{4,}$/;
