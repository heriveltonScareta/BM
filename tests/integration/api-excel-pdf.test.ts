import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { prisma, resetDatabase } from "../setup/db";
import { asUser, createTestUsers } from "../setup/session";
import { CNPJ_A, CNPJ_B, createClientFixture } from "../setup/fixtures";
import { extractPdfText } from "../setup/pdf-text";
import type { SessionUser } from "@/lib/auth/rbac";
import { GET as modeloGET } from "@/app/api/medicoes/modelo-importacao/route";
import { POST as importarPOST } from "@/app/api/medicoes/[id]/importar/route";
import { GET as exportarGET } from "@/app/api/medicoes/[id]/exportar/route";
import { GET as pdfGET } from "@/app/api/medicoes/[id]/pdf/route";
import { createMeasurement, addItem, getMeasurement } from "@/lib/services/measurement.service";
import { createMeasurementSchema, laborItemSchema } from "@/lib/validation/measurement";
import { buildTemplateWorkbook } from "@/lib/excel/template";
import { MeasurementStatus as S } from "@/lib/db/generated/enums";

const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) });

function xlsx(sheets: Record<string, Array<Array<string | number | null>>>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

function upload(
  path: string,
  file: { name: string; buffer: Buffer; type?: string },
  mode?: string,
) {
  const form = new FormData();
  form.set(
    "file",
    new File([new Uint8Array(file.buffer)], file.name, {
      type: file.type ?? "application/octet-stream",
    }),
  );
  if (mode) form.set("mode", mode);
  return new Request(`http://localhost${path}`, { method: "POST", body: form });
}

describe("API modelo, importação, exportação e PDF", () => {
  let users: {
    admin: SessionUser;
    operacional: SessionUser;
    financeiro: SessionUser;
    cliente: SessionUser;
  };
  let idA = "";
  let idB = "";

  beforeAll(async () => {
    await resetDatabase();
    const a = await createClientFixture("AAA", CNPJ_A);
    const b = await createClientFixture("BBB", CNPJ_B);
    users = await createTestUsers(a.client.id);
    const mk = (clientId: string, contractId: string) =>
      createMeasurement(
        users.admin,
        createMeasurementSchema.parse({
          clientId,
          contractId,
          competence: "06/2026",
          startDate: "2026-06-01",
          endDate: "2026-06-30",
          issueDate: "2026-06-30",
        }),
        { label: "t" },
      );
    idA = (await mk(a.client.id, a.contract.id)).id;
    idB = (await mk(b.client.id, b.contract.id)).id;
    await addItem(
      { kind: "ALL" },
      idA,
      "mao-de-obra",
      laborItemSchema.parse({
        code: "MO-X",
        role: "Existente",
        quantity: "1",
        unit: "h",
        unitPrice: "10",
      }),
      { label: "t" },
    );
  });

  afterAll(async () => {
    asUser(null);
    await prisma.$disconnect();
  });

  it("modelo: download para quem edita; financeiro não", async () => {
    asUser(users.financeiro);
    expect(
      (await modeloGET(new Request("http://localhost/api/medicoes/modelo-importacao"), ctx({})))
        .status,
    ).toBe(403);
    asUser(users.operacional);
    const res = await modeloGET(
      new Request("http://localhost/api/medicoes/modelo-importacao"),
      ctx({}),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("modelo-importacao-medicao.xlsx");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });

  it("importação: valida extensão, conteúdo real, erros estruturados (nada gravado) e modos", async () => {
    asUser(users.operacional);
    const fake = await importarPOST(
      upload(`/api/medicoes/${idA}/importar`, {
        name: "x.xlsx",
        buffer: Buffer.from("%PDF-1.4 nao e planilha"),
      }),
      ctx({ id: idA }),
    );
    expect(fake.status).toBe(422);
    const ext = await importarPOST(
      upload(`/api/medicoes/${idA}/importar`, { name: "x.txt", buffer: buildTemplateWorkbook() }),
      ctx({ id: idA }),
    );
    expect(ext.status).toBe(422);

    const comErros = xlsx({
      "Mao de Obra": [
        ["Código", "Função", "Descrição", "Quantidade", "Unidade", "Dias/Horas", "Valor Unitário"],
        ["MO-1", "Blaster", "", "10", "h", "22", "55"],
        ["MO-2", "", "", "10", "h", "22", "55"],
        ["MO-3", "Ajudante", "", "dez", "h", "22", "28"],
      ],
      Equipamentos: [
        [
          "Código",
          "Equipamento",
          "Descrição",
          "Quantidade",
          "Unidade",
          "Dias/Horas",
          "Valor Unitário",
        ],
        ["EQ-1", "Perfuratriz", "", "5", "h", "22", ""],
      ],
    });
    const errRes = await importarPOST(
      upload(
        `/api/medicoes/${idA}/importar`,
        { name: "erros.xlsx", buffer: comErros },
        "substituir",
      ),
      ctx({ id: idA }),
    );
    expect(errRes.status).toBe(422);
    const body = (await errRes.json()) as {
      error: { code: string; details: Array<{ aba: string; linha: number; coluna: string }> };
    };
    expect(body.error.code).toBe("IMPORT_ERRORS");
    expect(body.error.details.map((d) => [d.aba, d.linha, d.coluna])).toEqual([
      ["Equipamentos", 2, "Valor Unitário"],
      ["Mao de Obra", 3, "Função"],
      ["Mao de Obra", 4, "Quantidade"],
    ]);
    // nada gravado: o item existente continua sozinho
    expect((await getMeasurement({ kind: "ALL" }, idA)).laborItems.map((i) => i.code)).toEqual([
      "MO-X",
    ]);

    // adicionar: mantem o existente
    const add = await importarPOST(
      upload(
        `/api/medicoes/${idA}/importar`,
        { name: "modelo.xlsx", buffer: buildTemplateWorkbook() },
        "adicionar",
      ),
      ctx({ id: idA }),
    );
    expect(add.status).toBe(200);
    const addJson = (await add.json()) as {
      labor: number;
      equipment: number;
      totals: { totalAmount: string };
    };
    expect(addJson).toMatchObject({ labor: 2, equipment: 2 });
    let m = await getMeasurement({ kind: "ALL" }, idA);
    expect(m.laborItems.map((i) => i.code)).toEqual(["MO-X", "MO-001", "MO-002"]);
    expect(m.laborItems.map((i) => i.sortOrder)).toEqual([0, 1, 2]);
    // 10 + 176x62,5 (11000) + 176x48,9 (8606,40) = 19616,40 ; eq: 150x385 (57750) + 20x1140 (22800) = 80550 ; total 100166,40
    expect(addJson.totals.totalAmount).toBe("100166.40");

    // substituir: apaga as abas presentes e regrava
    const rep = await importarPOST(
      upload(
        `/api/medicoes/${idA}/importar`,
        { name: "modelo.xlsx", buffer: buildTemplateWorkbook() },
        "substituir",
      ),
      ctx({ id: idA }),
    );
    expect(rep.status).toBe(200);
    m = await getMeasurement({ kind: "ALL" }, idA);
    expect(m.laborItems.map((i) => i.code)).toEqual(["MO-001", "MO-002"]);
    expect(m.equipmentItems).toHaveLength(2);
    expect(m.totalAmount.toString()).toBe("100156.4");
    const log = await prisma.auditLog.findFirst({
      where: { action: "ITENS_IMPORTADOS", entityId: idA },
      orderBy: { createdAt: "desc" },
    });
    expect(log?.after).toMatchObject({ modo: "substituir", maoDeObra: 2, equipamentos: 2 });

    // CSV so de equipamentos, modo substituir, nao mexe na mao de obra
    const csv = Buffer.from(
      "Código;Equipamento;Descrição;Quantidade;Unidade;Dias/Horas;Valor Unitário\nEQ-9;Rolo;;1;h;1;100\n",
      "utf8",
    );
    const csvRes = await importarPOST(
      upload(
        `/api/medicoes/${idA}/importar`,
        { name: "eq.csv", buffer: csv, type: "text/csv" },
        "substituir",
      ),
      ctx({ id: idA }),
    );
    expect(csvRes.status).toBe(200);
    m = await getMeasurement({ kind: "ALL" }, idA);
    expect(m.laborItems).toHaveLength(2);
    expect(m.equipmentItems.map((i) => i.code)).toEqual(["EQ-9"]);

    // financeiro/cliente nao importam; medicao de outro cliente e 404 para o cliente
    asUser(users.financeiro);
    expect(
      (
        await importarPOST(
          upload(`/api/medicoes/${idA}/importar`, {
            name: "modelo.xlsx",
            buffer: buildTemplateWorkbook(),
          }),
          ctx({ id: idA }),
        )
      ).status,
    ).toBe(403);
    // status bloqueado
    await prisma.measurement.update({ where: { id: idA }, data: { status: S.ENVIADO_AO_CLIENTE } });
    asUser(users.operacional);
    expect(
      (
        await importarPOST(
          upload(`/api/medicoes/${idA}/importar`, {
            name: "modelo.xlsx",
            buffer: buildTemplateWorkbook(),
          }),
          ctx({ id: idA }),
        )
      ).status,
    ).toBe(409);
  });

  it("exportação e PDF respeitam escopo; PDF bate com os totais", async () => {
    asUser(users.operacional);
    const exp = await exportarGET(new Request("http://localhost/x"), ctx({ id: idA }));
    expect(exp.status).toBe(200);
    expect(exp.headers.get("content-disposition")).toMatch(/BM-2026-\d{4}-itens\.xlsx/);
    const wb = XLSX.read(Buffer.from(await exp.arrayBuffer()), { type: "buffer" });
    expect(wb.SheetNames).toEqual(["Mao de Obra", "Equipamentos"]);
    expect(XLSX.utils.sheet_to_json(wb.Sheets["Mao de Obra"]!)).toHaveLength(2);

    const pdf = await pdfGET(new Request("http://localhost/x?inline=1"), ctx({ id: idA }));
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(pdf.headers.get("content-disposition")).toMatch(
      /inline; filename="BM-2026-\d{4}-rascunho\.pdf"/,
    );
    const m = await getMeasurement({ kind: "ALL" }, idA);
    const { text } = await extractPdfText(Buffer.from(await pdf.arrayBuffer()));
    expect(text).toContain(m.number);
    // 11000 + 8606,40 + 100 = 19706,40
    expect(m.totalAmount.toString()).toBe("19706.4");
    expect(text).toMatch(/VALOR TOTAL DA MEDIÇÃO\s+R\$\s?19\.706,40/);

    // cliente A: idA esta ENVIADO_AO_CLIENTE -> visivel; idB (outro cliente) -> 404
    asUser(users.cliente);
    expect((await pdfGET(new Request("http://localhost/x"), ctx({ id: idA }))).status).toBe(200);
    expect((await pdfGET(new Request("http://localhost/x"), ctx({ id: idB }))).status).toBe(404);
    expect((await exportarGET(new Request("http://localhost/x"), ctx({ id: idB }))).status).toBe(
      404,
    );
    // financeiro: ENVIADO_AO_CLIENTE ainda nao e visivel
    asUser(users.financeiro);
    expect((await pdfGET(new Request("http://localhost/x"), ctx({ id: idA }))).status).toBe(404);
  });
});
