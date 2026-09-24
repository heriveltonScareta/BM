import Decimal from "decimal.js";
import { prisma } from "@/lib/db/prisma";
import { InvoiceStatus, MeasurementStatus as S } from "@/lib/db/generated/enums";
import type { Scope } from "@/lib/auth/scope";
import type { SessionUser } from "@/lib/auth/rbac";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { audit, type AuditActor } from "@/lib/services/audit.service";
import { assertTransition } from "@/lib/services/status-machine";
import { transitionMeasurement } from "@/lib/services/measurement.service";
import { findMeasurementBasic } from "@/lib/db/repositories/measurement.repository";
import { storeDocument } from "@/lib/services/document.service";
import { validateUpload } from "@/lib/services/upload-validation";
import { documentScopeWhere } from "@/lib/auth/scope";
import type { InvoiceData, InvoiceStatusData } from "@/lib/validation/invoice";
import { dateOnlyToUtc } from "@/lib/utils/dates";
import { formatCurrency } from "@/lib/utils/format";

async function requireMeasurement(scope: Scope, id: string) {
  const m = await findMeasurementBasic(prisma, scope, id);
  if (!m) throw new NotFoundError("Medição não encontrada.");
  return m;
}

/** Alerta (nao bloqueio) quando o valor da NF diverge do total da medicao. */
export function divergenceAlert(
  invoiceAmount: Decimal.Value,
  totalAmount: Decimal.Value,
): string | null {
  const a = new Decimal(invoiceAmount);
  const t = new Decimal(totalAmount);
  if (a.eq(t)) return null;
  const diff = a.minus(t);
  return `O valor da nota fiscal (${formatCurrency(a.toFixed(2))}) difere do total da medição (${formatCurrency(t.toFixed(2))}) em ${formatCurrency(diff.abs().toFixed(2))} ${diff.gt(0) ? "a mais" : "a menos"}.`;
}

/** ASSINADO -> LIBERADO_FATURAMENTO (Admin, Financeiro). Exige assinatura da versao vigente. */
export async function releaseForBilling(
  user: SessionUser,
  scope: Scope,
  id: string,
  actor: AuditActor,
) {
  return transitionMeasurement(user, scope, id, S.LIBERADO_FATURAMENTO, actor);
}

export interface InvoiceFiles {
  pdf?: { name: string; size: number; buffer: Buffer };
  xml?: { name: string; size: number; buffer: Buffer };
}

/**
 * Anexa (ou substitui) a NF: PDF + XML validados, registro Invoice e transicao
 * LIBERADO_FATURAMENTO -> NF_ANEXADA. Em NF_ANEXADA permite substituir antes de faturar.
 */
export async function attachInvoice(
  user: SessionUser,
  scope: Scope,
  id: string,
  data: InvoiceData,
  files: InvoiceFiles,
  actor: AuditActor,
) {
  const m = await requireMeasurement(scope, id);
  if (m.status !== S.LIBERADO_FATURAMENTO && m.status !== S.NF_ANEXADA) {
    throw new AppError(
      "A nota fiscal só pode ser anexada após a liberação para faturamento.",
      409,
      "INVALID_STATE",
    );
  }
  if (m.status === S.LIBERADO_FATURAMENTO) assertTransition(m.status, S.NF_ANEXADA, user.role);
  else if (!["ADMIN", "FINANCEIRO"].includes(user.role))
    throw new AppError("Você não tem permissão para esta ação.", 403, "FORBIDDEN");

  const previous = await prisma.invoice.findUnique({ where: { measurementId: id } });
  // NF cancelada por estorno nao vale como "NF existente": o novo ciclo exige uma NF completa
  const existing = previous && previous.status !== InvoiceStatus.CANCELADA ? previous : null;
  if (!existing && (!files.pdf || !files.xml)) {
    throw new AppError("Envie o PDF e o XML da nota fiscal.", 422, "VALIDATION_ERROR", [
      ...(!files.pdf ? [{ path: "pdf", message: "Envie o PDF da nota fiscal." }] : []),
      ...(!files.xml ? [{ path: "xml", message: "Envie o XML da nota fiscal." }] : []),
    ]);
  }
  if (files.pdf) validateUpload(files.pdf, ["pdf"], "pdf");
  if (files.xml) validateUpload(files.xml, ["xml"], "xml");

  const alert = divergenceAlert(data.amount, m.totalAmount.toString());
  const result = await prisma.$transaction(async (tx) => {
    let pdfDocumentId = existing?.pdfDocumentId ?? null;
    let xmlDocumentId = existing?.xmlDocumentId ?? null;
    if (files.pdf) {
      if (pdfDocumentId)
        await tx.document.update({ where: { id: pdfDocumentId }, data: { deletedAt: new Date() } });
      pdfDocumentId = (
        await storeDocument(
          tx,
          {
            measurementId: id,
            clientId: m.clientId,
            type: "NF_PDF",
            fileName: files.pdf.name,
            mimeType: "application/pdf",
            data: files.pdf.buffer,
            uploadedByUserId: user.id,
          },
          actor,
        )
      ).id;
    }
    if (files.xml) {
      if (xmlDocumentId)
        await tx.document.update({ where: { id: xmlDocumentId }, data: { deletedAt: new Date() } });
      xmlDocumentId = (
        await storeDocument(
          tx,
          {
            measurementId: id,
            clientId: m.clientId,
            type: "NF_XML",
            fileName: files.xml.name,
            mimeType: "application/xml",
            data: files.xml.buffer,
            uploadedByUserId: user.id,
          },
          actor,
        )
      ).id;
    }
    const invoiceData = {
      number: data.number,
      series: data.series,
      issueDate: dateOnlyToUtc(data.issueDate),
      amount: data.amount,
      notes: data.notes,
      pdfDocumentId,
      xmlDocumentId,
    };
    const invoice = existing
      ? await tx.invoice.update({ where: { id: existing.id }, data: invoiceData })
      : previous
        ? // reaproveita o registro (measurementId e unico), mas como uma NF nova: emitida, sem envio
          await tx.invoice.update({
            where: { id: previous.id },
            data: { ...invoiceData, status: InvoiceStatus.EMITIDA, sentAt: null },
          })
        : await tx.invoice.create({
            data: { ...invoiceData, measurementId: id, status: InvoiceStatus.EMITIDA },
          });
    await audit(tx, {
      entity: "Invoice",
      entityId: invoice.id,
      action: existing ? "NF_ALTERADA" : "NF_ANEXADA",
      actor,
      before: existing
        ? {
            measurementId: id,
            number: existing.number,
            amount: existing.amount.toString(),
            issueDate: existing.issueDate.toISOString().slice(0, 10),
          }
        : undefined,
      after: {
        measurementId: id,
        number: invoice.number,
        series: invoice.series,
        amount: invoice.amount.toString(),
        issueDate: data.issueDate,
        divergencia: alert,
      },
    });
    if (m.status === S.LIBERADO_FATURAMENTO) {
      const updated = await tx.measurement.updateMany({
        where: { id, status: S.LIBERADO_FATURAMENTO },
        data: { status: S.NF_ANEXADA },
      });
      if (updated.count !== 1)
        throw new ConflictError("A medição foi alterada por outro usuário. Recarregue a página.");
      await audit(tx, {
        entity: "Measurement",
        entityId: id,
        action: "STATUS_ALTERADO",
        actor,
        before: { status: m.status },
        after: { status: S.NF_ANEXADA, nf: invoice.number },
      });
    }
    return invoice;
  });
  return { invoice: result, alert };
}

/** NF_ANEXADA -> FATURADO (Admin, Financeiro). Exige NF completa. */
export async function markInvoiced(user: SessionUser, scope: Scope, id: string, actor: AuditActor) {
  const m = await requireMeasurement(scope, id);
  const invoice = await prisma.invoice.findUnique({ where: { measurementId: id } });
  const after = await transitionMeasurement(user, scope, id, S.FATURADO, actor);
  return {
    measurement: after,
    alert: invoice ? divergenceAlert(invoice.amount.toString(), m.totalAmount.toString()) : null,
  };
}

/** Atualiza o status da NF (emitida/enviada/paga/cancelada), data de envio e observacoes. */
export async function updateInvoiceStatus(
  user: SessionUser,
  scope: Scope,
  id: string,
  data: InvoiceStatusData,
  actor: AuditActor,
) {
  if (!["ADMIN", "FINANCEIRO"].includes(user.role))
    throw new AppError("Você não tem permissão para esta ação.", 403, "FORBIDDEN");
  const m = await requireMeasurement(scope, id);
  const before = await prisma.invoice.findUnique({ where: { measurementId: id } });
  if (!before) throw new NotFoundError("Nota fiscal não encontrada.");
  if (m.status !== S.NF_ANEXADA && m.status !== S.FATURADO)
    throw new AppError(
      "O status da nota fiscal só pode ser alterado com a NF anexada ou a medição faturada.",
      409,
      "INVALID_STATE",
    );
  if (before.status === InvoiceStatus.CANCELADA)
    throw new AppError("Uma nota fiscal cancelada não pode voltar a valer.", 409, "INVALID_STATE");
  return prisma.$transaction(async (tx) => {
    const after = await tx.invoice.update({
      where: { id: before.id },
      data: {
        status: data.status,
        sentAt: data.sentAt
          ? dateOnlyToUtc(data.sentAt)
          : data.status === InvoiceStatus.ENVIADA || data.status === InvoiceStatus.PAGA
            ? (before.sentAt ?? new Date())
            : before.sentAt,
        notes: data.notes ?? before.notes,
      },
    });
    await audit(tx, {
      entity: "Invoice",
      entityId: before.id,
      action: "NF_ALTERADA",
      actor,
      before: {
        measurementId: id,
        status: before.status,
        sentAt: before.sentAt?.toISOString() ?? null,
      },
      after: {
        measurementId: id,
        status: after.status,
        sentAt: after.sentAt?.toISOString() ?? null,
        notes: after.notes,
      },
    });
    return after;
  });
}

/** Dados de faturamento da medicao (NF, documentos da NF e alerta de divergencia). */
export async function getBillingInfo(scope: Scope, id: string) {
  const m = await requireMeasurement(scope, id);
  return billingInfoFor(m);
}

/** Variante para quem ja carregou a medicao (evita repetir a busca com escopo). */
export async function billingInfoFor(m: {
  id: string;
  status: S;
  totalAmount: { toString(): string };
  currentVersion: number;
}) {
  const id = m.id;
  const [invoice, signature] = await Promise.all([
    prisma.invoice.findUnique({
      where: { measurementId: id },
      include: { pdfDocument: true, xmlDocument: true },
    }),
    prisma.signature.findFirst({
      where: { measurementId: id, version: { version: m.currentVersion } },
    }),
  ]);
  return {
    status: m.status,
    totalAmount: m.totalAmount.toString(),
    hasSignature: !!signature,
    invoice: invoice
      ? {
          id: invoice.id,
          number: invoice.number,
          series: invoice.series,
          issueDate: invoice.issueDate.toISOString().slice(0, 10),
          amount: invoice.amount.toString(),
          status: invoice.status,
          sentAt: invoice.sentAt ? invoice.sentAt.toISOString().slice(0, 10) : null,
          notes: invoice.notes,
          pdfDocument:
            invoice.pdfDocument && !invoice.pdfDocument.deletedAt
              ? { id: invoice.pdfDocument.id, fileName: invoice.pdfDocument.fileName }
              : null,
          xmlDocument:
            invoice.xmlDocument && !invoice.xmlDocument.deletedAt
              ? { id: invoice.xmlDocument.id, fileName: invoice.xmlDocument.fileName }
              : null,
          alert: divergenceAlert(invoice.amount.toString(), m.totalAmount.toString()),
        }
      : null,
  };
}

/** Garante que documentos de NF de outra medicao nunca sao lidos por escopo errado (usado em testes). */
export function invoiceDocumentsWhere(scope: Scope, measurementId: string) {
  return {
    AND: [
      { measurementId, type: { in: ["NF_PDF", "NF_XML"] as const } },
      documentScopeWhere(scope),
    ],
  };
}
