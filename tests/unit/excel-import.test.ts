import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildTemplateWorkbook } from "@/lib/excel/template";
import { parseImport } from "@/lib/excel/import";
import { buildItemsWorkbook } from "@/lib/excel/export";
import { detectFileType } from "@/lib/storage/file-type";

const HEADER_MO = [
  "Código",
  "Função",
  "Descrição",
  "Quantidade",
  "Unidade",
  "Dias/Horas",
  "Valor Unitário",
];
const HEADER_EQ = [
  "Código",
  "Equipamento",
  "Descrição",
  "Quantidade",
  "Unidade",
  "Dias/Horas",
  "Valor Unitário",
];

function workbook(sheets: Record<string, Array<Array<string | number | null>>>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

describe("importação de planilha", () => {
  it("a planilha modelo importa sem erro", () => {
    const r = parseImport(buildTemplateWorkbook());
    expect(r.errors).toEqual([]);
    expect(r.laborItems).toHaveLength(2);
    expect(r.equipmentItems).toHaveLength(2);
    expect(r.laborItems[0]).toMatchObject({
      code: "MO-001",
      role: "Encarregado de perfuração",
      quantity: "176",
      unit: "h",
      daysHours: "22",
      unitPrice: "62.5",
    });
    expect(r.sheets).toEqual({ labor: true, equipment: true });
  });

  it("aceita números em formato brasileiro e americano e ignora Valor Total", () => {
    const r = parseImport(
      workbook({
        "Mão de Obra": [
          [...HEADER_MO, "Valor Total"],
          ["MO-1", "Blaster", "", "1.234,5", "h", "", "R$ 55,10", "999999"],
          ["MO-2", "Ajudante", "", "1,234.5", "h", "22", "28.75", ""],
          ["MO-3", "Encarregado", "", 10, "h", 22, 62.5, ""],
        ],
      }),
    );
    expect(r.errors).toEqual([]);
    expect(r.laborItems.map((i) => [i.quantity, i.unitPrice, i.daysHours])).toEqual([
      ["1234.5", "55.1", "0"],
      ["1234.5", "28.75", "22"],
      ["10", "62.5", "22"],
    ]);
  });

  it("três erros propositais retornam exatamente as três linhas/colunas (tudo ou nada)", () => {
    const r = parseImport(
      workbook({
        "Mao de Obra": [
          HEADER_MO,
          ["MO-1", "Blaster", "", "10", "h", "22", "55"],
          ["MO-2", "", "", "10", "h", "22", "55"], // função vazia (linha 3)
          ["MO-3", "Ajudante", "", "dez", "h", "22", "28"], // texto em numérico (linha 4)
          ["MO-4", "Encarregado", "", "10", "h", "22", "55"],
        ],
        Equipamentos: [HEADER_EQ, ["EQ-1", "Perfuratriz", "", "5", "h", "22", ""]], // valor unitário vazio (linha 2)
      }),
    );
    expect(r.errors).toEqual([
      {
        aba: "Equipamentos",
        linha: 2,
        coluna: "Valor Unitário",
        valorRecebido: "(vazio)",
        motivo: "Campo obrigatório.",
      },
      {
        aba: "Mao de Obra",
        linha: 3,
        coluna: "Função",
        valorRecebido: "(vazio)",
        motivo: "Campo obrigatório.",
      },
      {
        aba: "Mao de Obra",
        linha: 4,
        coluna: "Quantidade",
        valorRecebido: "dez",
        motivo: "Não é um número válido (use 1.234,56 ou 1234.56).",
      },
    ]);
    expect(r.laborItems).toEqual([]);
    expect(r.equipmentItems).toEqual([]);
  });

  it("coluna faltando é apontada na linha 1", () => {
    const r = parseImport(
      workbook({
        "Mao de Obra": [
          ["Código", "Função", "Quantidade", "Unidade", "Valor Unitário"],
          ["MO-1", "Blaster", 1, "h", 2],
        ],
      }),
    );
    expect(r.errors).toEqual([
      expect.objectContaining({
        aba: "Mao de Obra",
        linha: 1,
        coluna: "Descrição",
        motivo: "Coluna obrigatória ausente no cabeçalho.",
      }),
      expect.objectContaining({ aba: "Mao de Obra", linha: 1, coluna: "Dias/Horas" }),
    ]);
  });

  it("aba errada é rejeitada", () => {
    const r = parseImport(
      workbook({ Planilha1: [HEADER_MO, ["MO-1", "Blaster", "", 1, "h", 1, 1]], Outra: [["a"]] }),
    );
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.motivo).toMatch(/Nenhuma aba/);
  });

  it("xlsx com uma única aba de nome diferente é reconhecido pelo cabeçalho; CSV também", () => {
    const r = parseImport(
      workbook({
        Planilha1: [HEADER_EQ, ["EQ-1", "Caminhão pipa", "", "3", "dia", "3", "1.140,00"]],
      }),
    );
    expect(r.errors).toEqual([]);
    expect(r.equipmentItems[0]).toMatchObject({
      code: "EQ-1",
      name: "Caminhão pipa",
      unitPrice: "1140",
    });

    const csv = Buffer.from(`${HEADER_MO.join(";")}\nMO-1;Blaster;;10,5;h;22;55,10\n`, "utf8");
    const rc = parseImport(csv);
    expect(rc.errors).toEqual([]);
    expect(rc.laborItems[0]).toMatchObject({
      role: "Blaster",
      quantity: "10.5",
      unitPrice: "55.1",
    });
  });

  it("linhas em branco são ignoradas; negativo e limite de linhas são rejeitados", () => {
    const r = parseImport(
      workbook({
        "Mao de Obra": [
          HEADER_MO,
          [null, null, null, null, null, null, null],
          ["MO-1", "Blaster", "", "-1", "h", "", "5"],
        ],
      }),
    );
    expect(r.errors).toEqual([
      expect.objectContaining({
        linha: 3,
        coluna: "Quantidade",
        motivo: "O valor não pode ser negativo.",
      }),
    ]);

    const many = Array.from({ length: 5001 }, (_, i) => [`MO-${i}`, "X", "", 1, "h", 1, 1]);
    const big = parseImport(workbook({ "Mao de Obra": [HEADER_MO, ...many] }));
    expect(big.errors[0]?.motivo).toMatch(/Limite de 5000 linhas/);
  });

  it("exportação gera as duas abas com Valor Total e reimporta sem erro", () => {
    const buf = buildItemsWorkbook({
      number: "BM-2026-0001",
      laborItems: [
        {
          id: "1",
          code: "MO-1",
          label: "Blaster",
          description: null,
          quantity: "10.5",
          unit: "h",
          daysHours: "22",
          unitPrice: "55.1",
          totalPrice: "578.55",
          sortOrder: 0,
        },
      ],
      equipmentItems: [
        {
          id: "2",
          code: "EQ-1",
          label: "Perfuratriz",
          description: "x",
          quantity: "3",
          unit: "dia",
          daysHours: "3",
          unitPrice: "1140",
          totalPrice: "3420.00",
          sortOrder: 0,
        },
      ],
    });
    expect(detectFileType(buf)?.type).toBe("xlsx");
    const wb = XLSX.read(buf, { type: "buffer" });
    expect(wb.SheetNames).toEqual(["Mao de Obra", "Equipamentos"]);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Mao de Obra"]!);
    expect(rows[0]).toMatchObject({ Código: "MO-1", Função: "Blaster", "Valor Total": 578.55 });
    const r = parseImport(buf);
    expect(r.errors).toEqual([]);
    expect(r.laborItems).toHaveLength(1);
    expect(r.equipmentItems).toHaveLength(1);
  });
});

describe("detectFileType", () => {
  it("identifica pdf, png, jpeg, xml, csv e rejeita executável disfarçado", () => {
    expect(detectFileType(Buffer.from("%PDF-1.7\n..."))?.type).toBe("pdf");
    expect(
      detectFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.type,
    ).toBe("png");
    expect(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.type).toBe("jpeg");
    expect(detectFileType(Buffer.from('<?xml version="1.0"?><nfe/>'))?.type).toBe("xml");
    expect(detectFileType(Buffer.from("a;b;c\n1;2;3\n"))?.type).toBe("csv");
    expect(detectFileType(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]))).toBeNull();
    expect(detectFileType(Buffer.from("%PDF-1.7"), { allow: ["xlsx", "csv"] })).toBeNull();
  });
});
