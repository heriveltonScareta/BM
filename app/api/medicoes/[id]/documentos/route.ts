import { NextResponse } from "next/server";
import { withApi, actorFromRequest } from "@/lib/api/handler";
import { readMultipart } from "@/lib/api/upload";
import { requireAction, getScope } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import { ValidationError } from "@/lib/errors";
import {
  listMeasurementDocuments,
  uploadMeasurementDocument,
} from "@/lib/services/document.service";

export const GET = withApi(async (_req, ctx) => {
  const user = await requireAction("documentos:ver");
  const { id } = await ctx.params;
  const docs = await listMeasurementDocuments(getScope(user), idSchema.parse(id));
  return NextResponse.json(
    docs.map((d) => ({
      id: d.id,
      type: d.type,
      fileName: d.fileName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      checksum: d.checksum,
      createdAt: d.createdAt,
      uploadedBy: d.uploadedBy?.name ?? null,
    })),
  );
});

/** multipart: file (PDF, XML, PNG ou JPEG). */
export const POST = withApi(async (req, ctx) => {
  const user = await requireAction("documentos:upload");
  const { id } = await ctx.params;
  const { files } = await readMultipart(req);
  if (!files.file)
    throw new ValidationError("Selecione um arquivo.", [
      { path: "file", message: "Selecione um arquivo." },
    ]);
  const doc = await uploadMeasurementDocument(
    user,
    getScope(user),
    idSchema.parse(id),
    files.file,
    actorFromRequest(user, req),
  );
  return NextResponse.json(
    { id: doc.id, type: doc.type, fileName: doc.fileName, sizeBytes: doc.sizeBytes },
    { status: 201 },
  );
});
