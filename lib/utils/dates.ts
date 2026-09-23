import { TZDate } from "@date-fns/tz";
import { format, isValid, parse } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Fuso de exibicao. Datas sao armazenadas em UTC e convertidas apenas na apresentacao. */
export const TIMEZONE = "America/Sao_Paulo";

function toTz(date: Date | string | number): TZDate {
  return new TZDate(date instanceof Date ? date : new Date(date), TIMEZONE);
}

/** dd/MM/aaaa */
export function formatDate(date: Date | string | number | null | undefined): string {
  if (date === null || date === undefined) return "";
  const d = toTz(date);
  return isValid(d) ? format(d, "dd/MM/yyyy", { locale: ptBR }) : "";
}

/** dd/MM/aaaa HH:mm */
export function formatDateTime(date: Date | string | number | null | undefined): string {
  if (date === null || date === undefined) return "";
  const d = toTz(date);
  return isValid(d) ? format(d, "dd/MM/yyyy HH:mm", { locale: ptBR }) : "";
}

/** dd/MM/aaaa HH:mm:ss (fuso) — usado em evidencias de assinatura */
export function formatDateTimeWithZone(date: Date | string | number): string {
  const d = toTz(date);
  return `${format(d, "dd/MM/yyyy HH:mm:ss", { locale: ptBR })} (${TIMEZONE})`;
}

/** "2026-03" -> "03/2026" */
export function formatCompetence(competence: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(competence);
  return m ? `${m[2]}/${m[1]}` : competence;
}

/** "03/2026" -> "2026-03" (retorna null se invalido) */
export function parseCompetence(input: string): string | null {
  const m = /^(0[1-9]|1[0-2])\/(\d{4})$/.exec(input.trim());
  if (m) return `${m[2]}-${m[1]}`;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(input.trim())) return input.trim();
  return null;
}

/** Nome do mes por extenso: "2026-03" -> "março de 2026" */
export function competenceLabel(competence: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(competence);
  if (!m) return competence;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1, 12));
  return format(d, "MMMM 'de' yyyy", { locale: ptBR });
}

/** Converte "AAAA-MM-DD" (campo de data) em Date UTC a meia-noite, para colunas @db.Date. */
export function dateOnlyToUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Date (coluna @db.Date) -> "AAAA-MM-DD" */
export function dateToDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Interpreta dd/MM/aaaa digitado pelo usuario. */
export function parseBrDate(input: string): Date | null {
  const d = parse(input.trim(), "dd/MM/yyyy", new Date());
  return isValid(d) ? dateOnlyToUtc(format(d, "yyyy-MM-dd")) : null;
}

/** Ano corrente no fuso de Sao Paulo (usado na numeracao BM-AAAA-NNNN). */
export function yearInTimezone(date: Date = new Date()): number {
  return toTz(date).getFullYear();
}

/** Competencia corrente (AAAA-MM) no fuso de Sao Paulo. */
export function currentCompetence(date: Date = new Date()): string {
  return format(toTz(date), "yyyy-MM");
}
