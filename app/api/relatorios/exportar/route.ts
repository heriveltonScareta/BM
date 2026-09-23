import { withApi, parseQuery } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { exportFormatSchema, reportFiltersSchema } from "@/lib/validation/report";
import { assertReportAllowed, getReport } from "@/lib/services/report.service";
import { buildReportWorkbook } from "@/lib/excel/relatorio";
import { renderRelatorioPdf } from "@/lib/pdf/relatorio";
import { describeFilters } from "@/lib/services/report-filters";

export const GET = withApi(async (req) => {
  const user = await requireAction("relatorios:ver");
  const f = parseQuery(
    req,
    reportFiltersSchema.extend({ formato: exportFormatSchema.default("xlsx") }),
  );
  assertReportAllowed(user, f.tipo);
  const r = await getReport(getScope(user), f, { all: true });
  const filtros = await describeFilters(f);
  const slug = `relatorio-${f.tipo}-${new Date().toISOString().slice(0, 10)}`;
  if (f.formato === "pdf") {
    const pdf = await renderRelatorioPdf(f.tipo, r, filtros);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${slug}.pdf"`,
        "cache-control": "no-store",
      },
    });
  }
  const xlsx = buildReportWorkbook(f.tipo, r, filtros);
  return new Response(new Uint8Array(xlsx), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${slug}.xlsx"`,
      "cache-control": "no-store",
    },
  });
});
