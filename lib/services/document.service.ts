import { prisma, type Db } from "@/lib/db/prisma";
import type { DocumentType } from "@/lib/db/generated/enums";
import { documentScopeWhere, type Scope } from "@/lib/auth/scope";
import { NotFoundError } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import { sanitizeFileName } from "@/lib/storage/file-type";
import { audit, type AuditActor } from "@/lib/services/audit.service";

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
  return prisma.document.findMany({
    where: { AND: [{ measurementId }, documentScopeWhere(scope)] },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true } } },
  });
}
