import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createHash } from "node:crypto";
import { BoletimDocument } from "./boletim";
import type { BoletimData } from "./data";

/** Gera o PDF do boletim no servidor (sem headless browser). */
export async function renderBoletimPdf(data: BoletimData): Promise<Buffer> {
  // BoletimDocument devolve um <Document>; o tipo do react-pdf exige o elemento raiz tipado.
  const element = createElement(BoletimDocument, {
    data,
  }) as unknown as ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);
  return Buffer.from(buffer);
}

export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
