import { AppError } from "@/lib/errors";

export interface UploadedFile {
  name: string;
  size: number;
  buffer: Buffer;
}

/** Le multipart/form-data; devolve campos de texto e arquivos (Buffer) por nome. */
/** Maior arquivo aceito em qualquer upload (a validacao por tipo e mais restrita). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function readMultipart(
  req: Request,
  options: { maxBytes?: number } = {},
): Promise<{ fields: Record<string, string>; files: Record<string, UploadedFile> }> {
  const maxBytes = options.maxBytes ?? MAX_UPLOAD_BYTES;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError("Envie os dados como multipart/form-data.", 400, "BAD_FORM");
  }
  const fields: Record<string, string> = {};
  const files: Record<string, UploadedFile> = {};
  for (const [key, value] of form.entries()) {
    if (value instanceof File) {
      if (value.size === 0 && !value.name) continue;
      // tamanho verificado ANTES de carregar o conteudo em memoria
      if (value.size > maxBytes)
        throw new AppError(
          `O arquivo "${value.name}" excede o tamanho máximo permitido.`,
          413,
          "FILE_TOO_LARGE",
        );
      files[key] = {
        name: value.name,
        size: value.size,
        buffer: Buffer.from(await value.arrayBuffer()),
      };
    } else {
      fields[key] = String(value);
    }
  }
  return { fields, files };
}
