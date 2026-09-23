import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../setup/db";
import { createTestUsers } from "../setup/session";
import { CNPJ_A, createClientFixture } from "../setup/fixtures";
import { extractPdfText } from "../setup/pdf-text";
import {
  addItem,
  createMeasurement,
  getMeasurement,
  updateMeasurementHeader,
} from "@/lib/services/measurement.service";
import {
  createMeasurementSchema,
  laborItemSchema,
  equipmentItemSchema,
  measurementHeaderSchema,
} from "@/lib/validation/measurement";
import { buildBoletimData, pdfFileName } from "@/lib/pdf/data";
import { renderBoletimPdf, sha256Hex } from "@/lib/pdf/render";
import { valorPorExtenso } from "@/lib/pdf/extenso";
import type { Scope } from "@/lib/auth/scope";

const ALL: Scope = { kind: "ALL" };
const actor = { label: "teste" };

describe("boletim em PDF", () => {
  let id = "";

  beforeAll(async () => {
    await resetDatabase();
    const a = await createClientFixture("AAA", CNPJ_A);
    const users = await createTestUsers(a.client.id);
    const m = await createMeasurement(
      users.admin,
      createMeasurementSchema.parse({
        clientId: a.client.id,
        contractId: a.contract.id,
        competence: "05/2026",
        startDate: "2026-05-01",
        endDate: "2026-05-31",
        issueDate: "2026-05-31",
        frs: "FRS-777",
        purchaseOrder: "PC-888",
        notes: "Observação de teste do boletim.",
      }),
      actor,
    );
    id = m.id;
    for (let i = 1; i <= 45; i++) {
      await addItem(
        ALL,
        id,
        "mao-de-obra",
        laborItemSchema.parse({
          code: `MO-${String(i).padStart(3, "0")}`,
          role: `Função ${i}`,
          quantity: "10",
          unit: "h",
          unitPrice: "12,34",
        }),
        actor,
      );
    }
    for (let i = 1; i <= 12; i++) {
      await addItem(
        ALL,
        id,
        "equipamentos",
        equipmentItemSchema.parse({
          code: `EQ-${i}`,
          name: `Equipamento ${i}`,
          quantity: "2,5",
          unit: "dia",
          unitPrice: "1.000,00",
        }),
        actor,
      );
    }
    await updateMeasurementHeader(
      ALL,
      id,
      measurementHeaderSchema.parse({
        contractId: a.contract.id,
        competence: "05/2026",
        startDate: "2026-05-01",
        endDate: "2026-05-31",
        issueDate: "2026-05-31",
        frs: "FRS-777",
        purchaseOrder: "PC-888",
        notes: "Observação de teste do boletim.",
        discountAmount: "100",
        taxAmount: "50,5",
      }),
      actor,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("gera um PDF válido, com múltiplas páginas, cabeçalho repetido, numeração e valores da tela", async () => {
    const m = await getMeasurement(ALL, id);
    const data = buildBoletimData(m, { generatedAt: new Date("2026-06-01T12:00:00Z") });
    const pdf = await renderBoletimPdf(data);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(sha256Hex(pdf)).toMatch(/^[0-9a-f]{64}$/);

    const { pages, text } = await extractPdfText(pdf);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    // numeracao "Pagina X de Y" em todas as paginas
    pages.forEach((p, i) => expect(p).toContain(`Página ${i + 1} de ${pages.length}`));
    // cabecalho do documento e da tabela repetidos na continuacao
    expect(pages[1]).toContain("Boletim de Medição");
    expect(pages[1]).toMatch(/CÓDIGO\s+FUNÇÃO/i);
    // cabecalho, comercial, itens e totais
    expect(text).toContain("Prestadora Demo Ltda");
    expect(text).toContain(m.number);
    expect(text).toContain("AAA Ltda");
    expect(text).toContain("05/2026");
    expect(text).toContain("01/05/2026 a 31/05/2026");
    expect(text).toContain("FRS-777");
    expect(text).toContain("PC-888");
    expect(text).toContain("MO-045");
    expect(text).toContain("EQ-12");
    // 45 x (10 x 12,34 = 123,40) = 5553,00 ; 12 x (2,5 x 1000) = 30000,00 ; subtotal 35553,00 ; total 35553 - 100 + 50,50 = 35503,50
    expect(m.totalAmount.toString()).toBe("35503.5");
    expect(text).toMatch(/5\.553,00/);
    expect(text).toMatch(/30\.000,00/);
    expect(text).toMatch(/35\.553,00/);
    expect(text).toMatch(/VALOR TOTAL DA MEDIÇÃO\s+R\$\s?35\.503,50/);
    expect(text).toContain("Trinta e cinco mil quinhentos e três reais e cinquenta centavos");
    expect(text).toContain("Observação de teste do boletim.");
    expect(text).toContain("RASCUNHO"); // marca d'agua enquanto nao aprovado
    expect(text).toContain("MP 2.200-2/2001");
    expect(text).not.toContain("certificado");
    expect(pdfFileName(m.number, m.currentVersion)).toBe(`${m.number}-rascunho.pdf`);
  });

  it("sem marca d'água quando aprovado e com bloco de evidências quando assinado", async () => {
    await prisma.measurement.update({
      where: { id },
      data: { status: "ASSINADO", currentVersion: 2 },
    });
    const m = await getMeasurement(ALL, id);
    const pdf = await renderBoletimPdf(
      buildBoletimData(m, {
        signature: {
          signerName: "Carla Menezes",
          signerEmail: "carla@cliente.com",
          signedAt: new Date("2026-06-02T15:30:00Z"),
          ipAddress: "177.35.120.14",
          userAgent: "Mozilla/5.0 Teste",
          documentHash: "a".repeat(64),
          version: 2,
        },
      }),
    );
    const { text } = await extractPdfText(pdf);
    expect(text).not.toContain("RASCUNHO");
    expect(text).toContain("versão 2");
    expect(text).toMatch(/Evidências da assinatura eletrônica/i);
    expect(text).toContain("Carla Menezes");
    expect(text).toContain("02/06/2026 12:30:00 (America/Sao_Paulo)");
    expect(text).toMatch(/177\s?\.35\.120\.14/);
    expect(text).toContain("a".repeat(64));
    expect(pdfFileName(m.number, 2)).toBe(`${m.number}-v2.pdf`);
  });

  it("valor por extenso", () => {
    expect(valorPorExtenso("0.05")).toBe("Cinco centavos");
    expect(valorPorExtenso("1")).toBe("Um real");
    expect(valorPorExtenso("1234.56")).toBe(
      "Mil duzentos e trinta e quatro reais e cinquenta e seis centavos",
    );
    expect(valorPorExtenso("1000000")).toBe("Um milhão de reais");
  });
});
