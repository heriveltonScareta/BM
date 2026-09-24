import { bufferBody, withApi, parseQuery } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { exportFormatSchema, reportFiltersSchema } from "@/lib/validation/report";
import {
  assertReportAllowed,
  EXPORT_MAX_ROWS,
  EXPORT_PDF_MAX_ROWS,
  getReport,
} from "@/lib/services/report.service";
import { ValidationError } from "@/lib/errors";
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
  if (f.formato === "pdf" && r.total > EXPORT_PDF_MAX_ROWS)
    throw new ValidationError(
      `O PDF comporta até ${EXPORT_PDF_MAX_ROWS} medições; refine os filtros ou exporte em Excel.`,
    );
  if (r.total > EXPORT_MAX_ROWS)
    throw new ValidationError(
      `A exportação comporta até ${EXPORT_MAX_ROWS} medições; refine os filtros.`,
    );
  const filtros = await describeFilters(getScope(user), f);
  const slug = `relatorio-${f.tipo}-${new Date().toISOString().slice(0, 10)}`;
  if (f.formato === "pdf") {
    const pdf = await renderRelatorioPdf(f.tipo, r, filtros);
    return new Response(bufferBody(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${slug}.pdf"`,
        "cache-control": "no-store",
      },
    });
  }
  const xlsx = buildReportWorkbook(f.tipo, r, filtros);
  return new Response(bufferBody(xlsx), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${slug}.xlsx"`,
      "cache-control": "no-store",
    },
  });
});
