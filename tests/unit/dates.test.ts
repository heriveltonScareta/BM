import { describe, expect, it } from "vitest";
import {
  competenceLabel,
  dateOnlyToUtc,
  dateToDateOnly,
  formatCompetence,
  formatDate,
  formatDateTime,
  formatTimestampAsDate,
  parseBrDate,
  parseCompetence,
  yearInTimezone,
} from "@/lib/utils/dates";

describe("datas puras (@db.Date) não sofrem conversão de fuso", () => {
  it("formata meia-noite UTC como o próprio dia", () => {
    expect(formatDate(new Date("2026-01-15T00:00:00.000Z"))).toBe("15/01/2026");
    expect(formatDate("2026-01-15")).toBe("15/01/2026");
    expect(formatDate(dateOnlyToUtc("2026-12-31"))).toBe("31/12/2026");
    expect(dateToDateOnly(dateOnlyToUtc("2026-02-28"))).toBe("2026-02-28");
  });
  it("parseBrDate produz data pura em UTC", () => {
    expect(parseBrDate("05/03/2026")?.toISOString()).toBe("2026-03-05T00:00:00.000Z");
    expect(parseBrDate("31/02/2026")).toBeNull();
  });
});

describe("instantes são exibidos em America/Sao_Paulo", () => {
  it("converte UTC para o fuso (UTC-3)", () => {
    expect(formatDateTime("2026-01-15T01:30:00.000Z")).toBe("14/01/2026 22:30");
    expect(formatTimestampAsDate("2026-01-15T01:30:00.000Z")).toBe("14/01/2026");
    expect(yearInTimezone(new Date("2027-01-01T01:00:00.000Z"))).toBe(2026);
  });
});

describe("competência", () => {
  it("converte entre AAAA-MM e MM/AAAA", () => {
    expect(formatCompetence("2026-03")).toBe("03/2026");
    expect(parseCompetence("03/2026")).toBe("2026-03");
    expect(parseCompetence("13/2026")).toBeNull();
    expect(competenceLabel("2026-03")).toBe("março de 2026");
  });
});
