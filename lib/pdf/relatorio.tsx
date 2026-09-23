import { createElement, type ReactElement } from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
  type DocumentProps,
} from "@react-pdf/renderer";
import { registerFonts } from "./boletim";
import type { ReportResult } from "@/lib/services/report.service";
import type { ReportType } from "@/lib/validation/report";
import { REPORT_TITLES } from "@/lib/excel/relatorio";
import { STATUS_LABELS } from "@/lib/services/status-machine";
import { formatCurrency } from "@/lib/utils/format";
import { formatCompetence, formatDateTime } from "@/lib/utils/dates";
import { config } from "@/lib/config";

const s = StyleSheet.create({
  page: {
    fontFamily: "Inter",
    fontSize: 8,
    color: "#1f2937",
    paddingTop: 32,
    paddingBottom: 40,
    paddingHorizontal: 30,
  },
  title: { fontSize: 13, fontWeight: 700, color: "#1f4e5f" },
  sub: { fontSize: 7.5, color: "#6b7280", marginBottom: 8 },
  table: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 2, marginTop: 6 },
  th: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    minHeight: 14,
    alignItems: "center",
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
    minHeight: 13,
    alignItems: "center",
  },
  total: { flexDirection: "row", backgroundColor: "#f3f4f6", minHeight: 15, alignItems: "center" },
  td: { paddingVertical: 2, paddingHorizontal: 3 },
  thText: { fontSize: 6.5, fontWeight: 600, color: "#6b7280", textTransform: "uppercase" },
  right: { textAlign: "right" },
  section: { fontSize: 9, fontWeight: 700, marginTop: 10, marginBottom: 2, color: "#1f4e5f" },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 30,
    right: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 6.5,
    color: "#6b7280",
  },
});

type Col = {
  key: string;
  label: string;
  width: string;
  right?: boolean;
  get: (m: ReportResult["rows"][number]) => string;
};

function columns(tipo: ReportType): Col[] {
  const money = (v: string | null) => (v ? formatCurrency(v) : "—");
  if (tipo === "faturamento") {
    return [
      { key: "number", label: "Número", width: "12%", get: (m) => m.number },
      { key: "client", label: "Cliente", width: "20%", get: (m) => m.client },
      {
        key: "competence",
        label: "Comp.",
        width: "8%",
        get: (m) => formatCompetence(m.competence),
      },
      { key: "status", label: "Status", width: "14%", get: (m) => STATUS_LABELS[m.status] },
      {
        key: "total",
        label: "Total medição",
        width: "13%",
        right: true,
        get: (m) => money(m.totalAmount),
      },
      { key: "nf", label: "NF", width: "9%", get: (m) => m.invoiceNumber ?? "—" },
      {
        key: "nfAmount",
        label: "Valor NF",
        width: "12%",
        right: true,
        get: (m) => money(m.invoiceAmount),
      },
      {
        key: "signed",
        label: "Assinado em",
        width: "12%",
        get: (m) => (m.signedAt ? formatDateTime(m.signedAt) : "—"),
      },
    ];
  }
  return [
    { key: "number", label: "Número", width: "12%", get: (m) => m.number },
    { key: "client", label: "Cliente", width: "18%", get: (m) => m.client },
    { key: "contract", label: "Contrato", width: "11%", get: (m) => m.contract },
    { key: "competence", label: "Comp.", width: "7%", get: (m) => formatCompetence(m.competence) },
    {
      key: "frs",
      label: "FRS / PC",
      width: "14%",
      get: (m) => [m.frs, m.purchaseOrder].filter(Boolean).join(" / ") || "—",
    },
    { key: "status", label: "Status", width: "12%", get: (m) => STATUS_LABELS[m.status] },
    {
      key: "labor",
      label: "Mão de obra",
      width: "9%",
      right: true,
      get: (m) => money(m.laborTotal),
    },
    {
      key: "equip",
      label: "Equip.",
      width: "8%",
      right: true,
      get: (m) => money(m.equipmentTotal),
    },
    { key: "total", label: "Total", width: "9%", right: true, get: (m) => money(m.totalAmount) },
  ];
}

function RelatorioDocument({
  tipo,
  r,
  filtros,
}: {
  tipo: ReportType;
  r: ReportResult;
  filtros: string;
}) {
  registerFonts();
  const cols = columns(tipo);
  return (
    <Document title={REPORT_TITLES[tipo]} author={config.company.name}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.title}>{REPORT_TITLES[tipo]}</Text>
        <Text style={s.sub}>
          {config.company.name} · gerado em {formatDateTime(new Date())} · Filtros: {filtros} ·{" "}
          {r.total} medição(ões)
        </Text>
        <View style={s.table}>
          <View style={s.th} fixed>
            {cols.map((c) => (
              <Text
                key={c.key}
                style={[s.td, s.thText, { width: c.width }, ...(c.right ? [s.right] : [])]}
              >
                {c.label}
              </Text>
            ))}
          </View>
          {r.rows.map((m) => (
            <View key={m.id} style={s.tr} wrap={false}>
              {cols.map((c) => (
                <Text key={c.key} style={[s.td, { width: c.width }, ...(c.right ? [s.right] : [])]}>
                  {c.get(m)}
                </Text>
              ))}
            </View>
          ))}
          <View style={s.total} wrap={false}>
            <Text
              style={[s.td, { width: tipo === "faturamento" ? "54%" : "68%", fontWeight: 600 }]}
            >
              Total ({r.totais.quantidade})
            </Text>
            {tipo === "faturamento" ? (
              <>
                <Text style={[s.td, s.right, { width: "13%", fontWeight: 700 }]}>
                  {formatCurrency(r.totais.totalAmount)}
                </Text>
                <Text style={[s.td, { width: "9%" }]}></Text>
                <Text style={[s.td, s.right, { width: "12%", fontWeight: 700 }]}>
                  {formatCurrency(r.totais.invoiceAmount)}
                </Text>
                <Text style={[s.td, { width: "12%" }]}></Text>
              </>
            ) : (
              <>
                <Text style={[s.td, s.right, { width: "9%", fontWeight: 700 }]}>
                  {formatCurrency(r.totais.laborTotal)}
                </Text>
                <Text style={[s.td, s.right, { width: "8%", fontWeight: 700 }]}>
                  {formatCurrency(r.totais.equipmentTotal)}
                </Text>
                <Text style={[s.td, s.right, { width: "9%", fontWeight: 700 }]}>
                  {formatCurrency(r.totais.totalAmount)}
                </Text>
              </>
            )}
          </View>
        </View>
        <Text style={s.section}>Resumo por status</Text>
        <View style={s.table}>
          {r.porStatus.map((p) => (
            <View key={p.status} style={s.tr}>
              <Text style={[s.td, { width: "40%" }]}>{p.label}</Text>
              <Text style={[s.td, s.right, { width: "20%" }]}>{p.quantidade}</Text>
              <Text style={[s.td, s.right, { width: "40%" }]}>{formatCurrency(p.valor)}</Text>
            </View>
          ))}
        </View>
        <Text style={s.section}>Resumo por cliente</Text>
        <View style={s.table}>
          {r.porCliente.map((p) => (
            <View key={p.clientId} style={s.tr}>
              <Text style={[s.td, { width: "40%" }]}>{p.cliente}</Text>
              <Text style={[s.td, s.right, { width: "20%" }]}>{p.quantidade}</Text>
              <Text style={[s.td, s.right, { width: "40%" }]}>{formatCurrency(p.valor)}</Text>
            </View>
          ))}
        </View>
        <View style={s.footer} fixed>
          <Text>{REPORT_TITLES[tipo]}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderRelatorioPdf(
  tipo: ReportType,
  r: ReportResult,
  filtros: string,
): Promise<Buffer> {
  const el = createElement(RelatorioDocument, {
    tipo,
    r,
    filtros,
  }) as unknown as ReactElement<DocumentProps>;
  return Buffer.from(await renderToBuffer(el));
}
