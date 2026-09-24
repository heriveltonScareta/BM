-- Fase 7: coluna denormalizada AuditLog.measurementId (timeline e atividade indexadas),
-- Signature.signedDocumentId (PDF assinado por versao) e indices para filtros reais.

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "measurementId" TEXT;

-- AlterTable
ALTER TABLE "Signature" ADD COLUMN     "signedDocumentId" TEXT;

-- Backfill: eventos da propria medicao ou de entidades filhas (measurementId em before/after)
UPDATE "AuditLog" a
SET "measurementId" = m.id
FROM "Measurement" m
WHERE m.id = CASE
  WHEN a.entity = 'Measurement' THEN a."entityId"
  ELSE COALESCE(a.after ->> 'measurementId', a.before ->> 'measurementId')
END;

-- Backfill: primeiro boletim assinado gerado apos cada assinatura
UPDATE "Signature" s
SET "signedDocumentId" = (
  SELECT d.id FROM "Document" d
  WHERE d."measurementId" = s."measurementId"
    AND d.type = 'BOLETIM_ASSINADO'
    AND d."createdAt" >= s."signedAt"
    AND d.id NOT IN (SELECT "signedDocumentId" FROM "Signature" WHERE "signedDocumentId" IS NOT NULL)
  ORDER BY d."createdAt" ASC
  LIMIT 1
);

-- CreateIndex
CREATE INDEX "AuditLog_measurementId_createdAt_idx" ON "AuditLog"("measurementId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_measurementId_type_idx" ON "Document"("measurementId", "type");

-- CreateIndex
CREATE INDEX "Measurement_updatedAt_idx" ON "Measurement"("updatedAt");

-- CreateIndex
CREATE INDEX "Measurement_contractId_idx" ON "Measurement"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "Signature_signedDocumentId_key" ON "Signature"("signedDocumentId");

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_signedDocumentId_fkey" FOREIGN KEY ("signedDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_measurementId_fkey" FOREIGN KEY ("measurementId") REFERENCES "Measurement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
