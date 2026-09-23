import { expect, test, type Page } from "@playwright/test";
import * as XLSX from "xlsx";
import { login } from "./helpers";
import { extractPdfText } from "../setup/pdf-text";

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

function xlsx(sheets: Record<string, Array<Array<string | number | null>>>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

async function criarMedicao(page: Page): Promise<string> {
  await page.goto("/medicoes/nova");
  await page.getByRole("combobox", { name: "Cliente" }).click();
  await page.getByRole("option", { name: /Norte Industrial/ }).click();
  await page.getByLabel("Competência").fill("07/2026");
  await page.getByLabel("Competência").blur();
  await page.getByLabel("FRS").fill("FRS-XLS");
  await page.getByRole("button", { name: "Criar medição" }).click();
  await expect(page).toHaveURL(/\/medicoes\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

test.describe("excel e pdf", () => {
  test("modelo baixa, planilha com 3 erros retorna as 3 linhas, modelo importa e o PDF bate com a tela", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await login(page, "operacional");
    const id = await criarMedicao(page);

    // modelo para download
    const modelo = await page.request.get("/api/medicoes/modelo-importacao");
    expect(modelo.status()).toBe(200);
    expect(modelo.headers()["content-disposition"]).toContain("modelo-importacao-medicao.xlsx");
    const modeloBuf = await modelo.body();
    expect(modeloBuf.subarray(0, 2).toString()).toBe("PK");

    // planilha com 3 erros propositais
    const comErros = xlsx({
      "Mao de Obra": [
        HEADER_MO,
        ["MO-1", "Blaster", "", "10", "h", "22", "55"],
        ["MO-2", "", "", "10", "h", "22", "55"],
        ["MO-3", "Ajudante", "", "dez", "h", "22", "28"],
      ],
      Equipamentos: [HEADER_EQ, ["EQ-1", "Perfuratriz", "", "5", "h", "22", ""]],
    });
    await page.getByRole("button", { name: "Importar planilha" }).click();
    await page.locator("#arquivo-importacao").setInputFiles({
      name: "erros.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: comErros,
    });
    await page.getByRole("button", { name: "Importar", exact: true }).click();
    const tabelaErros = page.getByRole("table", { name: "Erros da importação" });
    await expect(tabelaErros.getByRole("row")).toHaveCount(4); // cabeçalho + 3
    await expect(tabelaErros.getByRole("row").nth(1)).toHaveText(
      /Equipamentos\s*2\s*Valor Unitário\s*\(vazio\)\s*Campo obrigatório\./,
    );
    await expect(tabelaErros.getByRole("row").nth(2)).toHaveText(/Mao de Obra\s*3\s*Função/);
    await expect(tabelaErros.getByRole("row").nth(3)).toHaveText(
      /Mao de Obra\s*4\s*Quantidade\s*dez/,
    );
    await expect(page.getByRole("alert")).toContainText(
      "3 erro(s) encontrado(s). Nada foi importado.",
    );

    // modelo importa sem erro (substituir)
    await page.locator("#arquivo-importacao").setInputFiles({
      name: "modelo.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: modeloBuf,
    });
    await page.getByLabel(/Substituir/).check();
    await page.getByRole("button", { name: "Importar", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("tab", { name: /Mão de Obra/ })).toContainText("2");
    await expect(page.getByRole("tab", { name: /Equipamentos/ })).toContainText("2");
    await expect(page.getByRole("textbox", { name: "Função do item MO-001" })).toHaveValue(
      "Encarregado de perfuração",
    );
    // 176x62,5 + 176x48,9 = 19606,40 ; 150x385 + 20x1140 = 80550,00 ; total 100156,40
    await expect(page.getByTestId("total-medicao")).toHaveText(/100\.156,40/);
    await page.getByRole("tab", { name: "Histórico" }).click();
    await expect(page.getByRole("list", { name: "Histórico da medição" })).toContainText(
      "Itens importados de planilha",
    );

    // exportar
    const exportado = await page.request.get(`/api/medicoes/${id}/exportar`);
    expect(exportado.status()).toBe(200);
    const wb = XLSX.read(await exportado.body(), { type: "buffer" });
    expect(wb.SheetNames).toEqual(["Mao de Obra", "Equipamentos"]);

    // PDF bate com a tela
    const pdf = await page.request.get(`/api/medicoes/${id}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect(pdf.headers()["content-disposition"]).toMatch(
      /attachment; filename="BM-2026-\d{4}-rascunho\.pdf"/,
    );
    const { text, pages } = await extractPdfText(await pdf.body());
    expect(pages).toHaveLength(1);
    expect(text).toContain("Página 1 de 1");
    expect(text).toContain("FRS-XLS");
    expect(text).toContain("Siderúrgica Norte Industrial S.A.");
    expect(text).toContain("Encarregado de perfuração");
    expect(text).toMatch(/VALOR TOTAL DA MEDIÇÃO\s+R\$\s?100\.156,40/);
    expect(text).toContain("Cem mil cento e cinquenta e seis reais e quarenta centavos");
    expect(text).toContain("RASCUNHO");

    // botão Gerar PDF abre em nova aba com o PDF
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("link", { name: "Gerar PDF" }).click(),
    ]);
    await popup.waitForLoadState();
    expect(popup.url()).toContain(`/api/medicoes/${id}/pdf`);
  });

  test("financeiro e cliente não importam; cliente baixa PDF só da própria medição", async ({
    page,
  }) => {
    await login(page, "cliente");
    // BM-2026-0007 (Serra Azul, EM_APROVACAO) e BM-2026-0008 (Vale Forte)
    const lista = await page.request.get("/api/medicoes?q=BM-2026-0007");
    const own = ((await lista.json()) as { items: Array<{ id: string }> }).items[0]!;
    expect((await page.request.get(`/api/medicoes/${own.id}/pdf`)).status()).toBe(200);
    const modelo = await page.request.get("/api/medicoes/modelo-importacao");
    expect(modelo.status()).toBe(403);
    await page.goto(`/medicoes/${own.id}`);
    await expect(page.getByRole("link", { name: "Gerar PDF" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Importar planilha" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Adicionar linha" })).toHaveCount(0);
  });
});
