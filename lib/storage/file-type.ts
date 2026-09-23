/**
 * Deteccao de tipo REAL de arquivo por assinatura (magic bytes), independente da extensao
 * e do MIME declarado pelo navegador (Secao 13).
 */
export type DetectedType = "pdf" | "xml" | "png" | "jpeg" | "xlsx" | "csv";

export interface FileTypeInfo {
  type: DetectedType;
  mimeType: string;
  extension: string;
}

const TYPES: Record<DetectedType, FileTypeInfo> = {
  pdf: { type: "pdf", mimeType: "application/pdf", extension: "pdf" },
  xml: { type: "xml", mimeType: "application/xml", extension: "xml" },
  png: { type: "png", mimeType: "image/png", extension: "png" },
  jpeg: { type: "jpeg", mimeType: "image/jpeg", extension: "jpg" },
  xlsx: { type: "xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" },
  csv: { type: "csv", mimeType: "text/csv", extension: "csv" },
};

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

/** Texto "seguro": sem bytes nulos e sem controle fora de tab/CR/LF nos primeiros 4 KB. */
function looksLikeText(buf: Buffer): boolean {
  const sample = buf.subarray(0, 4096);
  if (sample.length === 0) return false;
  for (const b of sample) {
    if (b === 0) return false;
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) return false;
  }
  return true;
}

export function detectFileType(buf: Buffer, options?: { allow?: DetectedType[] }): FileTypeInfo | null {
  let detected: DetectedType | null = null;
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) detected = "pdf"; // %PDF-
  else if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) detected = "png";
  else if (startsWith(buf, [0xff, 0xd8, 0xff])) detected = "jpeg";
  else if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) {
    // ZIP: xlsx contem "[Content_Types].xml" e "xl/" nas entradas
    const head = buf.subarray(0, Math.min(buf.length, 64 * 1024)).toString("latin1");
    detected = head.includes("[Content_Types].xml") && (head.includes("xl/") || head.includes("xl\\")) ? "xlsx" : null;
  } else if (looksLikeText(buf)) {
    const text = buf.subarray(0, 4096).toString("utf8").replace(/^﻿/, "").trimStart();
    detected = text.startsWith("<?xml") || text.startsWith("<") ? "xml" : "csv";
  }
  if (!detected) return null;
  if (options?.allow && !options.allow.includes(detected)) return null;
  return TYPES[detected];
}

/** Nome de arquivo seguro para Content-Disposition e armazenamento de metadados. */
export function sanitizeFileName(name: string, fallback = "arquivo"): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return base || fallback;
}
