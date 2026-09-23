import type { MeasurementStatus } from "@/lib/db/generated/enums";
import { buildSnapshot, type MeasurementSnapshot } from "@/lib/services/snapshot";
import type { MeasurementDetail } from "@/lib/db/repositories/measurement.repository";
import { config } from "@/lib/config";

export interface SignatureEvidence {
  signerName: string;
  signerEmail: string;
  signedAt: Date | string;
  ipAddress: string;
  userAgent: string;
  documentHash: string;
  version: number;
}

export interface BoletimData {
  company: { name: string; cnpj: string; email: string };
  snapshot: MeasurementSnapshot;
  /** "v2" | "rascunho" */
  versionLabel: string;
  status: MeasurementStatus;
  /** marca d'agua RASCUNHO enquanto nao estiver aprovado */
  isDraft: boolean;
  signature?: SignatureEvidence;
  generatedAt: Date;
}

const APPROVED_STATUSES: MeasurementStatus[] = [
  "APROVADO",
  "ASSINADO",
  "LIBERADO_FATURAMENTO",
  "NF_ANEXADA",
  "FATURADO",
];

export function versionLabel(version: number): string {
  return version > 0 ? `v${version}` : "rascunho";
}

export function pdfFileName(number: string, version: number): string {
  return `${number}-${versionLabel(version)}.pdf`;
}

/** Monta os dados do boletim a partir da medicao atual (estado vivo, nao de uma versao congelada). */
export function buildBoletimData(
  m: MeasurementDetail,
  options: { signature?: SignatureEvidence; generatedAt?: Date } = {},
): BoletimData {
  const snapshot = buildSnapshot(
    {
      ...m,
      client: {
        id: m.client.id,
        legalName: m.client.legalName,
        tradeName: m.client.tradeName,
        cnpj: m.client.cnpj,
      },
      contract: {
        id: m.contract.id,
        code: m.contract.code,
        name: m.contract.name,
        unit: m.contract.unit,
      },
    },
    m.currentVersion,
  );
  return {
    company: config.company,
    snapshot,
    versionLabel: versionLabel(m.currentVersion),
    status: m.status,
    isDraft: !APPROVED_STATUSES.includes(m.status),
    signature: options.signature,
    generatedAt: options.generatedAt ?? new Date(),
  };
}

/** Dados a partir de um snapshot congelado (versoes enviadas/assinadas — Fase 4). */
export function boletimDataFromSnapshot(
  snapshot: MeasurementSnapshot,
  status: MeasurementStatus,
  options: { signature?: SignatureEvidence; generatedAt?: Date } = {},
): BoletimData {
  return {
    company: config.company,
    snapshot,
    versionLabel: versionLabel(snapshot.version),
    status,
    isDraft: !APPROVED_STATUSES.includes(status),
    signature: options.signature,
    generatedAt: options.generatedAt ?? new Date(),
  };
}
