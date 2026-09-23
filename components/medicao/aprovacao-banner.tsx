"use client";

import { useState } from "react";
import { CheckCircle2, Clock, FileCheck2, MailOpen, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnviarDialog, type AprovadorOpcao } from "@/components/medicao/enviar-dialog";
import { MeasurementStatus as S } from "@/lib/db/generated/enums";
import { formatDateTime, formatDateTimeWithZone } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

export interface AprovacaoInfo {
  currentVersion: number;
  request: {
    sentToName: string;
    sentToEmail: string;
    sentAt: string;
    expiresAt: string;
    openedAt: string | null;
    decidedAt: string | null;
    decision: "APPROVED" | "CHANGES_REQUESTED" | null;
    comment: string | null;
    version: number;
    expired: boolean;
  } | null;
  signature: {
    signerName: string;
    signerEmail: string;
    signedAt: string;
    ipAddress: string;
    documentHash: string;
    version: number;
    signedDocumentId: string | null;
  } | null;
}

export function AprovacaoBanner({
  medicaoId,
  numero,
  status,
  info,
  aprovadores,
  podeReenviar,
}: {
  medicaoId: string;
  numero: string;
  status: S;
  info: AprovacaoInfo;
  aprovadores: AprovadorOpcao[];
  podeReenviar: boolean;
}) {
  const [reenviar, setReenviar] = useState(false);
  const { request, signature } = info;
  const aguardando =
    status === S.ENVIADO_AO_CLIENTE || status === S.EM_APROVACAO || status === S.APROVADO;
  if (!request && !signature) return null;

  let tone = "border-status-blue/30 bg-status-blue-bg";
  let Icon = Clock;
  let titulo = "";
  let descricao = "";
  if (status === S.CORRECAO_SOLICITADA && request) {
    tone = "border-status-amber/30 bg-status-amber-bg";
    Icon = TriangleAlert;
    titulo = `Correção solicitada por ${request.sentToName} em ${formatDateTime(request.decidedAt)}`;
    descricao = request.comment ? `“${request.comment}”` : "Sem comentário.";
  } else if (
    signature &&
    (status === S.ASSINADO ||
      status === S.LIBERADO_FATURAMENTO ||
      status === S.NF_ANEXADA ||
      status === S.FATURADO)
  ) {
    tone = "border-status-green/30 bg-status-green-bg";
    Icon = FileCheck2;
    titulo = `Assinado eletronicamente por ${signature.signerName} (${signature.signerEmail}) em ${formatDateTimeWithZone(signature.signedAt)}`;
    descricao = `Versão ${signature.version} · IP ${signature.ipAddress} · SHA-256 ${signature.documentHash.slice(0, 16)}…`;
  } else if (status === S.APROVADO && request) {
    tone = "border-status-green/30 bg-status-green-bg";
    Icon = CheckCircle2;
    titulo = `Aprovado por ${request.sentToName} em ${formatDateTime(request.decidedAt)} · aguardando assinatura eletrônica`;
    descricao = request.expired
      ? "O link expirou. Reenvie para o cliente assinar."
      : `Link válido até ${formatDateTime(request.expiresAt)}.`;
  } else if (aguardando && request) {
    Icon = request.openedAt ? MailOpen : Clock;
    titulo = `Enviado para ${request.sentToName} (${request.sentToEmail}) em ${formatDateTime(request.sentAt)} · versão ${request.version}`;
    descricao = request.expired
      ? "O link expirou sem decisão. Reenvie para gerar um novo link."
      : request.openedAt
        ? `Aberto pelo cliente em ${formatDateTime(request.openedAt)} · válido até ${formatDateTime(request.expiresAt)}.`
        : `Ainda não aberto · válido até ${formatDateTime(request.expiresAt)}.`;
    if (request.expired) {
      tone = "border-status-amber/30 bg-status-amber-bg";
      Icon = TriangleAlert;
    }
  } else {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border p-3 text-sm sm:flex-row sm:items-start sm:justify-between",
        tone,
      )}
      role="status"
    >
      <div className="flex min-w-0 gap-2">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="font-medium">{titulo}</p>
          <p className="text-muted-foreground">{descricao}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {signature?.signedDocumentId ? (
          <Button asChild size="sm" variant="outline">
            <a href={`/api/documentos/${signature.signedDocumentId}/download`}>
              <FileCheck2 aria-hidden /> PDF assinado
            </a>
          </Button>
        ) : null}
        {podeReenviar && aguardando ? (
          <Button size="sm" variant="outline" onClick={() => setReenviar(true)}>
            <RefreshCw aria-hidden /> Reenviar link
          </Button>
        ) : null}
      </div>
      {podeReenviar ? (
        <EnviarDialog
          medicaoId={medicaoId}
          numero={numero}
          aprovadores={aprovadores}
          reenvio
          open={reenviar}
          onClose={() => setReenviar(false)}
        />
      ) : null}
    </div>
  );
}
