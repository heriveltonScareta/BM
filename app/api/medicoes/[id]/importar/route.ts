import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, actorFromRequest } from "@/lib/api/handler";
import { requireAction, getScope } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/common";
import { AppError, ValidationError } from "@/lib/errors";
import { detectFileType } from "@/lib/storage/file-type";
import { MAX_FILE_BYTES } from "@/lib/excel/columns";
import { parseImport } from "@/lib/excel/import";
import { importItems } from "@/lib/services/measurement.service";

const modeSchema = z.enum(["substituir", "adicionar"]);

/** multipart/form-data: file (.xlsx/.csv ate 10 MB) + mode (substituir|adicionar). */
export const POST = withApi(async (req, ctx) => {
  const user = await requireAction("medicao:editar");
  const { id } = await ctx.params;
  const measurementId = idSchema.parse(id);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError("Envie o arquivo como multipart/form-data.", 400, "BAD_FORM");
  }
  const mode = modeSchema.parse(form.get("mode") ?? "adicionar");
  const file = form.get("file");
  if (!(file instanceof File))
    throw new ValidationError("Selecione um arquivo .xlsx ou .csv.", [
      { path: "file", message: "Selecione um arquivo." },
    ]);
  if (file.size > MAX_FILE_BYTES)
    throw new ValidationError("Arquivo acima de 10 MB.", [
      { path: "file", message: "Arquivo acima de 10 MB." },
    ]);
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext !== "xlsx" && ext !== "csv")
    throw new ValidationError("Extensão não permitida.", [
      { path: "file", message: "Use .xlsx ou .csv." },
    ]);
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = detectFileType(buffer, { allow: ["xlsx", "csv"] });
  if (!type || (ext === "xlsx" && type.type !== "xlsx") || (ext === "csv" && type.type !== "csv")) {
    throw new ValidationError("O conteúdo do arquivo não corresponde à extensão.", [
      { path: "file", message: "O conteúdo do arquivo não corresponde à extensão." },
    ]);
  }

  const parsed = parseImport(buffer);
  if (parsed.errors.length) {
    return NextResponse.json(
      {
        error: {
          code: "IMPORT_ERRORS",
          message: `${parsed.errors.length} erro(s) encontrado(s). Nada foi importado.`,
          details: parsed.errors,
        },
      },
      { status: 422 },
    );
  }
  if (parsed.laborItems.length + parsed.equipmentItems.length === 0) {
    throw new ValidationError("A planilha não contém linhas para importar.");
  }
  const summary = await importItems(
    getScope(user),
    measurementId,
    parsed,
    mode,
    actorFromRequest(user, req),
  );
  return NextResponse.json(summary);
});
