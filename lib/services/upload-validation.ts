import { ValidationError } from "@/lib/errors";
import { detectFileType, type DetectedType, type FileTypeInfo } from "@/lib/storage/file-type";
import { UPLOAD_LIMITS } from "@/lib/validation/invoice";

const EXTENSIONS: Record<DetectedType, string[]> = {
  pdf: ["pdf"],
  xml: ["xml"],
  png: ["png"],
  jpeg: ["jpg", "jpeg"],
  xlsx: ["xlsx"],
  csv: ["csv"],
};

/**
 * Valida extensao, tipo real (assinatura) e tamanho de um arquivo enviado (Secao 13).
 * Lanca ValidationError com o campo informado.
 */
export function validateUpload(
  file: { name: string; size: number; buffer: Buffer },
  allow: Array<"pdf" | "xml" | "png" | "jpeg">,
  field = "file",
): FileTypeInfo {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const allowedExt = allow.flatMap((t) => EXTENSIONS[t]);
  const issue = (message: string) => new ValidationError(message, [{ path: field, message }]);
  if (!allowedExt.includes(ext))
    throw issue(`Extensão não permitida. Use: ${allowedExt.map((e) => `.${e}`).join(", ")}.`);
  const type = detectFileType(file.buffer, { allow });
  if (!type || !EXTENSIONS[type.type].includes(ext))
    throw issue("O conteúdo do arquivo não corresponde à extensão informada.");
  const limit = UPLOAD_LIMITS[type.type as keyof typeof UPLOAD_LIMITS];
  if (file.size > limit)
    throw issue(`Arquivo acima do limite de ${Math.round(limit / 1024 / 1024)} MB.`);
  if (file.size === 0) throw issue("Arquivo vazio.");
  return type;
}
