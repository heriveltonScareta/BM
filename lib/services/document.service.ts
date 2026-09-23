import { prisma, type Db } from "@/lib/db/prisma";
import type { DocumentType } from "@/lib/db/generated/enums";
import { documentScopeWhere, type Scope } from "@/lib/auth/scope";
import { NotFoundError } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import { sanitizeFileName } from "@/lib/storage/file-type";
import { audit, type AuditActor } from "@/lib/services/audit.service";
import { findMeasurementBasic } from "@/lib/db/repositories/measurement.repository";

/**
 * Documentos (Secao 13): a chave de storage e um UUID; o nome original fica so em metadados.
 * Download exclusivamente por rota autenticada com verificacao de escopo.
 */
export interface StoreDocumentInput {
  measurementId?: string | null;
  clientId?: string | null;
  type: DocumentType;
  fileName: string;
  mimeType: string;
  data: Buffer;
  uploadedByUserId?: string | null;
}

/** Grava o arquivo no storage e o registro em Document (dentro da transacao informada). */
export async function storeDocument(db: Db, input: StoreDocumentInput, actor?: AuditActor) {
  const extension = input.fileName.split(".").pop()?.toLowerCase();
  const stored = await getStorage().put(input.data, { extension });
  const doc = await db.document.create({
    data: {
      measurementId: input.measurementId ?? null,
      clientId: input.clientId ?? null,
      type: input.type,
      fileName: sanitizeFileName(input.fileName),
      mimeType: input.mimeType,
      sizeBytes: stored.sizeBytes,
      storageKey: stored.key,
      checksum: stored.checksum,
      uploadedByUserId: input.uploadedByUserId ?? null,
    },
  });
  if (actor) {
    await audit(db, {
      entity: "Document",
      entityId: doc.id,
      action: "DOCUMENTO_ENVIADO",
      actor,
      after: {
        measurementId: doc.measurementId,
        type: doc.type,
        fileName: doc.fileName,
        sizeBytes: doc.sizeBytes,
        checksum: doc.checksum,
      },
    });
  }
  return doc;
}

/** Sempre `AND: [{ id }, escopo]` (ver CLAUDE.md, isolamento). */
export async function getDocumentForDownload(scope: Scope, id: string) {
  const doc = await prisma.document.findFirst({
    where: { AND: [{ id }, documentScopeWhere(scope)] },
  });
  if (!doc) throw new NotFoundError("Documento não encontrado.");
  const data = await getStorage().get(doc.storageKey);
  return { doc, data };
}

export async function listMeasurementDocuments(scope: Scope, measurementId: string) {
  // 404 quando a medicao nao esta no escopo (nunca uma lista vazia com 200)
  const m = await findMeasurementBasic(prisma, scope, measurementId);
  if (!m) throw new NotFoundError("Medição não encontrada.");
  return prisma.document.findMany({
    where: { AND: [{ measurementId }, documentScopeWhere(scope)] },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true } } },
  });
}

// ---------------------------------------------------------------------------
// upload, remocao e listagem (area de documentos)
// ---------------------------------------------------------------------------

import { validateUpload } from "@/lib/services/upload-validation";
import { AppError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth/rbac";
import type { DocumentListQuery } from "@/lib/validation/invoice";
import type { Paginated } from "@/lib/validation/common";
import type { Prisma } from "@/lib/db/generated/client";

/** Anexa um documento avulso (tipo OUTRO) a uma medicao: PDF, XML ou imagem. */
export async function uploadMeasurementDocument(
  user: SessionUser,
  scope: Scope,
  measurementId: string,
  file: { name: string; size: number; buffer: Buffer },
  actor: AuditActor,
) {
  const m = await findMeasurementBasic(prisma, scope, measurementId);
  if (!m) throw new NotFoundError("Medição não encontrada.");
  if (m.status === "CANCELADO")
    throw new AppError("Medição cancelada não recebe documentos.", 409, "INVALID_STATE");
  const type = validateUpload(file, ["pdf", "xml", "png", "jpeg"]);
  return prisma.$transaction((tx) =>
    storeDocument(
      tx,
      {
        measurementId,
        clientId: m.clientId,
        type: "OUTRO",
        fileName: file.name,
        mimeType: type.mimeType,
        data: file.buffer,
        uploadedByUserId: user.id,
      },
      actor,
    ),
  );
}

/** Remocao logica. Somente documentos avulsos (OUTRO); boletins e NF fazem parte do historico. */
export async function removeDocument(scope: Scope, id: string, actor: AuditActor) {
  const doc = await prisma.document.findFirst({
    where: { AND: [{ id }, documentScopeWhere(scope)] },
  });
  if (!doc) throw new NotFoundError("Documento não encontrado.");
  if (doc.type !== "OUTRO")
    throw new AppError(
      "Boletins e notas fiscais não podem ser removidos; eles fazem parte do histórico da medição.",
      409,
      "DOCUMENT_PROTECTED",
    );
  await prisma.$transaction(async (tx) => {
    await tx.document.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, {
      entity: "Document",
      entityId: id,
      action: "DOCUMENTO_REMOVIDO",
      actor,
      before: { measurementId: doc.measurementId, type: doc.type, fileName: doc.fileName },
    });
  });
}

export const documentListSelect = {
  id: true,
  type: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  checksum: true,
  createdAt: true,
  measurement: { select: { id: true, number: true, status: true } },
  client: { select: { id: true, code: true, tradeName: true } },
  uploadedBy: { select: { name: true } },
} satisfies Prisma.DocumentSelect;

export type DocumentListRow = Prisma.DocumentGetPayload<{ select: typeof documentListSelect }>;

export async function listDocuments(
  scope: Scope,
  query: DocumentListQuery,
): Promise<Paginated<DocumentListRow>> {
  const filters: Prisma.DocumentWhereInput = {};
  if (query.type) filters.type = query.type;
  if (query.clientId) filters.clientId = query.clientId;
  if (query.q) {
    filters.OR = [
      { fileName: { contains: query.q, mode: "insensitive" } },
      { measurement: { number: { contains: query.q, mode: "insensitive" } } },
      { client: { tradeName: { contains: query.q, mode: "insensitive" } } },
    ];
  }
  const where: Prisma.DocumentWhereInput = { AND: [filters, documentScopeWhere(scope)] };
  const [items, total] = await Promise.all([
    prisma.document.findMany({
      where,
      select: documentListSelect,
      orderBy: [{ [query.sort]: query.order }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.document.count({ where }),
  ]);
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
