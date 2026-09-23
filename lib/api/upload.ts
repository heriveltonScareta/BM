import { AppError } from "@/lib/errors";

export interface UploadedFile {
  name: string;
  size: number;
  buffer: Buffer;
}

/** Le multipart/form-data; devolve campos de texto e arquivos (Buffer) por nome. */
export async function readMultipart(
  req: Request,
): Promise<{ fields: Record<string, string>; files: Record<string, UploadedFile> }> {
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
