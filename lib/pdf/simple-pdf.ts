import { createElement, type ReactElement } from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
  type DocumentProps,
} from "@react-pdf/renderer";
import { registerFonts } from "./boletim";

const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 11, padding: 40, color: "#1f2937" },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 12 },
  line: { marginBottom: 4 },
});

/** PDF simples com titulo e linhas de texto (usado pelo seed para notas fiscais de demonstracao). */
export async function renderSimplePdf(title: string, lines: string[]): Promise<Buffer> {
  registerFonts();
  const doc = createElement(
    Document,
    { title },
    createElement(
      Page,
      { size: "A4", style: s.page },
      createElement(
        View,
        null,
        createElement(Text, { style: s.title }, title),
        ...lines.map((l, i) => createElement(Text, { style: s.line, key: i }, l)),
      ),
    ),
  ) as unknown as ReactElement<DocumentProps>;
  return Buffer.from(await renderToBuffer(doc));
}
