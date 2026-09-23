import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { BoletimData } from "./data";
import type { SnapshotItem } from "@/lib/services/snapshot";
import { formatCurrency, formatQuantity } from "@/lib/utils/format";
import {
  formatCompetence,
  formatDate,
  formatDateTime,
  formatDateTimeWithZone,
} from "@/lib/utils/dates";
import { formatCnpj } from "@/lib/validation/cnpj";
import { valorPorExtenso } from "./extenso";
import { STATUS_LABELS } from "@/lib/services/status-machine";

const FONT_DIR = path.join(process.cwd(), "lib", "pdf", "fonts");

let fontsRegistered = false;
export function registerFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: "Inter",
    fonts: [
      { src: path.join(FONT_DIR, "Inter-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "Inter-SemiBold.ttf"), fontWeight: 600 },
      { src: path.join(FONT_DIR, "Inter-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

const INK = "#1f2937";
const MUTED = "#6b7280";
const LINE = "#d1d5db";
const HEAD = "#f3f4f6";
const ACCENT = "#1f4e5f";

const s = StyleSheet.create({
  page: {
    fontFamily: "Inter",
    fontSize: 8.5,
    color: INK,
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1.5,
    borderBottomColor: ACCENT,
    paddingBottom: 8,
    marginBottom: 10,
  },
  companyName: { fontSize: 13, fontWeight: 700, color: ACCENT },
  small: { fontSize: 7.5, color: MUTED },
  title: { fontSize: 14, fontWeight: 700, textAlign: "right" },
  grid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  cell: { width: "25%", paddingRight: 8, marginBottom: 4 },
  cellWide: { width: "50%", paddingRight: 8, marginBottom: 4 },
  label: { fontSize: 6.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.3 },
  value: { fontSize: 8.5 },
  commercial: {
    flexDirection: "row",
    backgroundColor: HEAD,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 3,
    padding: 8,
    marginBottom: 10,
  },
  commercialItem: { width: "50%" },
  commercialValue: { fontSize: 12, fontWeight: 700 },
  sectionTitle: { fontSize: 9.5, fontWeight: 700, marginTop: 8, marginBottom: 4, color: ACCENT },
  table: { borderWidth: 1, borderColor: LINE, borderRadius: 2 },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
    minHeight: 15,
    alignItems: "center",
  },
  th: {
    flexDirection: "row",
    backgroundColor: HEAD,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    minHeight: 16,
    alignItems: "center",
  },
  thText: { fontSize: 7, fontWeight: 600, color: MUTED, textTransform: "uppercase" },
  td: { paddingVertical: 2.5, paddingHorizontal: 4 },
  right: { textAlign: "right" },
  totalRow: { flexDirection: "row", backgroundColor: HEAD, minHeight: 16, alignItems: "center" },
  summary: { marginTop: 10, flexDirection: "row", justifyContent: "flex-end" },
  summaryBox: { width: 260, borderWidth: 1, borderColor: LINE, borderRadius: 3 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
  },
  summaryTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: ACCENT,
  },
  summaryTotalText: { color: "#ffffff", fontWeight: 700, fontSize: 10 },
  extenso: { marginTop: 4, fontSize: 8, color: MUTED, textAlign: "right" },
  notes: { marginTop: 10, borderWidth: 1, borderColor: LINE, borderRadius: 3, padding: 8 },
  approval: { marginTop: 18, flexDirection: "row", justifyContent: "space-between" },
  sigBox: {
    width: "46%",
    borderTopWidth: 1,
    borderTopColor: INK,
    paddingTop: 4,
    alignItems: "center",
  },
  evidence: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: ACCENT,
    borderRadius: 3,
    padding: 8,
    backgroundColor: "#f0f6f8",
  },
  legal: { marginTop: 6, fontSize: 6.5, color: MUTED },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: MUTED,
    borderTopWidth: 0.5,
    borderTopColor: LINE,
    paddingTop: 4,
  },
  watermark: {
    position: "absolute",
    top: 320,
    left: 90,
    fontSize: 96,
    fontWeight: 700,
    color: "#9ca3af",
    opacity: 0.18,
    transform: "rotate(-30deg)",
  },
});

const W = {
  code: "10%",
  label: "25%",
  desc: "17%",
  qty: "9%",
  unit: "7%",
  dh: "10%",
  price: "11%",
  total: "11%",
} as const;

function ItemsTable({
  title,
  labelHeader,
  items,
  total,
  emptyText,
}: {
  title: string;
  labelHeader: string;
  items: SnapshotItem[];
  total: string;
  emptyText: string;
}) {
  return (
    <View>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.table}>
        <View style={s.th} fixed>
          <Text style={[s.td, s.thText, { width: W.code }]}>Código</Text>
          <Text style={[s.td, s.thText, { width: W.label }]}>{labelHeader}</Text>
          <Text style={[s.td, s.thText, { width: W.desc }]}>Descrição</Text>
          <Text style={[s.td, s.thText, s.right, { width: W.qty }]}>Quant.</Text>
          <Text style={[s.td, s.thText, { width: W.unit }]}>Unid.</Text>
          <Text style={[s.td, s.thText, s.right, { width: W.dh }]}>Dias/Horas</Text>
          <Text style={[s.td, s.thText, s.right, { width: W.price }]}>Vlr. unit.</Text>
          <Text style={[s.td, s.thText, s.right, { width: W.total }]}>Vlr. total</Text>
        </View>
        {items.length === 0 ? (
          <View style={s.tr}>
            <Text style={[s.td, { color: MUTED }]}>{emptyText}</Text>
          </View>
        ) : null}
        {items.map((i) => (
          <View style={s.tr} key={i.id} wrap={false}>
            <Text style={[s.td, { width: W.code }]}>{i.code}</Text>
            <Text style={[s.td, { width: W.label }]}>{i.label}</Text>
            <Text style={[s.td, { width: W.desc, color: MUTED }]}>{i.description ?? ""}</Text>
            <Text style={[s.td, s.right, { width: W.qty }]}>{formatQuantity(i.quantity)}</Text>
            <Text style={[s.td, { width: W.unit }]}>{i.unit}</Text>
            <Text style={[s.td, s.right, { width: W.dh }]}>{formatQuantity(i.daysHours)}</Text>
            <Text style={[s.td, s.right, { width: W.price }]}>
              {formatCurrency(i.unitPrice).replace("R$", "").trim()}
            </Text>
            <Text style={[s.td, s.right, { width: W.total }]}>
              {formatCurrency(i.totalPrice).replace("R$", "").trim()}
            </Text>
          </View>
        ))}
        <View style={s.totalRow} wrap={false}>
          <Text style={[s.td, { width: "89%", textAlign: "right", fontWeight: 600 }]}>
            Total {title.toLowerCase()}
          </Text>
          <Text style={[s.td, s.right, { width: W.total, fontWeight: 700 }]}>
            {formatCurrency(total).replace("R$", "").trim()}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Field({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={wide ? s.cellWide : s.cell}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value || "—"}</Text>
    </View>
  );
}

export function BoletimDocument({ data }: { data: BoletimData }) {
  registerFonts();
  const { snapshot: sn, company, signature } = data;
  const t = sn.totals;
  const summaryRows: Array<[string, string]> = [
    ["Total mão de obra", t.laborTotal],
    ["Total equipamentos", t.equipmentTotal],
    ["Outros", t.otherAmount],
    ["Subtotal", t.subtotal],
    ["Descontos (−)", t.discountAmount],
    ["Acréscimos (+)", t.additionAmount],
    ["Impostos (+)", t.taxAmount],
  ];
  const fileTitle = `${sn.measurement.number} ${data.versionLabel}`;

  return (
    <Document
      title={`Boletim de Medição ${fileTitle}`}
      author={company.name}
      language="pt-BR"
      creator="Sistema de Medição"
    >
      <Page size="A4" style={s.page}>
        {data.isDraft ? (
          <Text style={s.watermark} fixed>
            RASCUNHO
          </Text>
        ) : null}

        <View style={s.header} fixed>
          <View>
            <Text style={s.companyName}>{company.name}</Text>
            <Text style={s.small}>
              CNPJ {formatCnpj(company.cnpj)} · {company.email}
            </Text>
          </View>
          <View>
            <Text style={s.title}>Boletim de Medição</Text>
            <Text style={[s.value, { textAlign: "right", fontWeight: 600 }]}>
              {sn.measurement.number} ·{" "}
              {data.versionLabel === "rascunho"
                ? "rascunho"
                : `versão ${data.versionLabel.replace("v", "")}`}
            </Text>
            <Text style={[s.small, { textAlign: "right" }]}>
              Status: {STATUS_LABELS[data.status]}
            </Text>
          </View>
        </View>

        <View style={s.grid}>
          <Field label="Cliente" value={sn.client.legalName} wide />
          <Field label="CNPJ do cliente" value={formatCnpj(sn.client.cnpj)} />
          <Field label="Competência" value={formatCompetence(sn.measurement.competence)} />
          <Field label="Contrato" value={`${sn.contract.code} · ${sn.contract.name}`} wide />
          <Field label="Unidade" value={sn.contract.unit} />
          <Field label="Data de emissão" value={formatDate(sn.measurement.issueDate)} />
          <Field
            label="Período"
            value={`${formatDate(sn.measurement.startDate)} a ${formatDate(sn.measurement.endDate)}`}
          />
        </View>

        <View style={s.commercial}>
          <View style={s.commercialItem}>
            <Text style={s.label}>FRS — Folha de Registro de Serviço</Text>
            <Text style={s.commercialValue}>{sn.measurement.frs || "—"}</Text>
          </View>
          <View style={s.commercialItem}>
            <Text style={s.label}>PC — Pedido de Compra</Text>
            <Text style={s.commercialValue}>{sn.measurement.purchaseOrder || "—"}</Text>
          </View>
        </View>

        <ItemsTable
          title="Mão de obra"
          labelHeader="Função"
          items={sn.laborItems}
          total={t.laborTotal}
          emptyText="Sem itens de mão de obra."
        />
        <ItemsTable
          title="Equipamentos"
          labelHeader="Equipamento"
          items={sn.equipmentItems}
          total={t.equipmentTotal}
          emptyText="Sem itens de equipamentos."
        />

        <View style={s.summary} wrap={false}>
          <View style={s.summaryBox}>
            {summaryRows.map(([label, value]) => (
              <View style={s.summaryRow} key={label}>
                <Text>{label}</Text>
                <Text>{formatCurrency(value)}</Text>
              </View>
            ))}
            <View style={s.summaryTotal}>
              <Text style={s.summaryTotalText}>VALOR TOTAL DA MEDIÇÃO</Text>
              <Text style={s.summaryTotalText}>{formatCurrency(t.totalAmount)}</Text>
            </View>
          </View>
        </View>
        <Text style={s.extenso}>{valorPorExtenso(t.totalAmount)}</Text>

        <View style={s.notes} wrap={false}>
          <Text style={s.label}>Observações</Text>
          <Text style={s.value}>{sn.measurement.notes || "Sem observações."}</Text>
        </View>

        <View wrap={false}>
          <Text style={s.sectionTitle}>Aprovação</Text>
          <View style={s.approval}>
            <View style={s.sigBox}>
              <Text style={{ fontWeight: 600 }}>{company.name}</Text>
              <Text style={s.small}>Prestadora — responsável pela medição</Text>
            </View>
            <View style={s.sigBox}>
              <Text style={{ fontWeight: 600 }}>{sn.client.legalName}</Text>
              <Text style={s.small}>
                {signature
                  ? `${signature.signerName} · ${signature.signerEmail}`
                  : "Cliente — aprovador"}
              </Text>
            </View>
          </View>
          {signature ? (
            <View style={s.evidence}>
              <Text style={[s.label, { color: ACCENT }]}>Evidências da assinatura eletrônica</Text>
              <Text>
                Assinado por: {signature.signerName} ({signature.signerEmail})
              </Text>
              <Text>Data/hora: {formatDateTimeWithZone(signature.signedAt)}</Text>
              <Text>
                IP: {signature.ipAddress} · Versão assinada: v{signature.version}
              </Text>
              <Text>Navegador: {signature.userAgent}</Text>
              <Text>SHA-256 do documento: {signature.documentHash}</Text>
            </View>
          ) : null}
          <Text style={s.legal}>
            Assinatura eletrônica simples com registro de evidências (nome, e-mail, data/hora, IP e
            hash do documento), nos termos do art. 10, §2º da MP 2.200-2/2001. Não se trata de
            assinatura digital ICP-Brasil.
          </Text>
        </View>

        <View style={s.footer} fixed>
          <Text>
            {sn.measurement.number} · {data.versionLabel} · gerado em{" "}
            {formatDateTime(data.generatedAt)}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
