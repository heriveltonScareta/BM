import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/** Converte "R$ 1.234,56" em centavos (inteiro) para somar sem erro de ponto flutuante. */
function centavos(texto: string): number {
  const m = /-?R\$\s*([\d.]+),(\d{2})/.exec(texto);
  if (!m) throw new Error(`valor monetário não encontrado em "${texto}"`);
  const sinal = texto.trim().startsWith("-") ? -1 : 1;
  return sinal * (Number(m[1]!.replace(/\./g, "")) * 100 + Number(m[2]));
}

test.describe("dashboard", () => {
  test("admin vê indicadores, gráficos com tabela equivalente, pendências e filtro de competência", async ({
    page,
  }) => {
    await login(page, "admin");
    const indicadores = page.getByRole("region", { name: "Indicadores" });
    await expect(indicadores).toContainText("Em elaboração");
    await expect(indicadores).toContainText("Aguardando cliente");
    await expect(indicadores).toContainText("Aprovadas não faturadas");
    await expect(indicadores).toContainText("Faturadas");
    await expect(indicadores).toContainText(/R\$/);
    const alertas = page.getByRole("region", { name: "Alertas" });
    await expect(alertas).toContainText("Links de aprovação expirados");

    const graficos = page.getByRole("region", { name: "Gráficos" });
    await expect(graficos.getByText("Faturado por competência")).toBeVisible();
    await expect(graficos.getByText("Medições por status")).toBeVisible();
    await expect(graficos.getByText("Valor por cliente")).toBeVisible();
    await expect(graficos.locator(".recharts-bar-rectangle").first()).toBeVisible();

    // toda visualizacao tem tabela equivalente
    await graficos.getByRole("button", { name: "Tabela" }).nth(1).click();
    const tabela = graficos.getByRole("table").first();
    await expect(tabela).toContainText("Faturado");
    await expect(tabela).toContainText("Cancelado");

    await expect(page.getByRole("region", { name: "Pendências e atividade" })).toContainText(
      "Link de aprovação expirado sem decisão",
    );
    await expect(page.getByRole("list", { name: "Atividade recente" })).toBeVisible();

    // filtro de competencia muda os cards (09/2026 nao tem medicoes faturadas no seed)
    await page.getByRole("combobox", { name: "Competência" }).click();
    await page.getByRole("option", { name: "09/2026" }).click();
    await expect(page).toHaveURL(/competence=2026-09/);
    await expect(
      page.getByText("Visão geral das medições e do faturamento · setembro de 2026."),
    ).toBeVisible();
    await expect(indicadores.getByRole("link", { name: /^Faturadas 0 R\$ 0,00$/ })).toBeVisible();
    // card leva a listagem filtrada
    await indicadores.locator("a", { hasText: "Em elaboração" }).click();
    await expect(page).toHaveURL(/\/medicoes\?competence=2026-09/);
  });

  test("operacional não vê valores consolidados; cliente vê só o próprio cliente", async ({
    page,
  }) => {
    await login(page, "operacional");
    const indicadores = page.getByRole("region", { name: "Indicadores" });
    await expect(indicadores).toContainText("Em elaboração");
    await expect(indicadores).not.toContainText("R$");
    await expect(page.getByText("Medições por cliente")).toBeVisible();

    await login(page, "cliente");
    await expect(page.getByRole("region", { name: "Gráficos" })).not.toContainText("por cliente");
    await page
      .getByRole("region", { name: "Gráficos" })
      .getByRole("button", { name: "Tabela" })
      .nth(1)
      .click();
    const tabela = page.getByRole("region", { name: "Gráficos" }).getByRole("table").first();
    await expect(tabela).not.toContainText("Rascunho");
    await expect(page.getByRole("list", { name: "Pendências" })).not.toContainText("Vale Forte");
  });
});

test.describe("relatórios", () => {
  test("filtros combinados: soma dos cards = soma da tabela = total do filtro; exporta Excel e PDF", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await login(page, "financeiro");
    await page.goto("/relatorios?tipo=financeiro&de=2026-07&ate=2026-09");
    await expect(page.getByRole("link", { name: "Financeiro" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // combina cliente + status por cima do periodo
    await page.getByRole("combobox", { name: "Cliente" }).click();
    await page.getByRole("option", { name: "Serra Azul Mineração" }).click();
    await expect(page).toHaveURL(/clientId=/);
    // o status filtrado vem da primeira linha (outros specs mudam o status das medições do seed)
    const tabela = page.getByRole("table", { name: "Relatório de Financeiro" });
    await expect(tabela).toBeVisible();
    const linhas = tabela.locator("tbody tr");
    const statusAlvo = (await linhas.first().locator("td").nth(3).innerText()).trim();
    await page.getByRole("combobox", { name: "Status" }).click();
    await page.getByRole("option", { name: statusAlvo, exact: true }).click();
    await expect(page).toHaveURL(/statuses=[A-Z_]+/);
    await expect(linhas.first()).toContainText("Serra Azul Mineração");
    expect(await linhas.count()).toBeGreaterThanOrEqual(1);
    for (const texto of await linhas.locator("td:nth-child(4)").allInnerTexts())
      expect(texto.trim()).toBe(statusAlvo);

    // soma da coluna Total (tbody) == rodape == card "Total do filtro" == soma dos cards por status
    const totaisLinhas = (await linhas.locator("td:nth-child(5)").allTextContents()).map(centavos);
    const somaLinhas = totaisLinhas.reduce((a, b) => a + b, 0);
    const rodape = centavos(await tabela.locator("tfoot td").nth(4).innerText());
    const totalFiltro = centavos(await page.getByTestId("total-filtro").innerText());
    const cards = (await page.getByTestId("card-valor").allTextContents()).map(centavos);
    const somaCards = cards.reduce((a, b) => a + b, 0);
    expect(somaLinhas).toBeGreaterThan(0);
    expect(rodape).toBe(somaLinhas);
    expect(totalFiltro).toBe(somaLinhas);
    expect(somaCards).toBe(somaLinhas);

    // limpar filtros: volta a mostrar varias linhas e os totais continuam consistentes
    await page.getByRole("button", { name: "Limpar filtros" }).click();
    await expect(page).not.toHaveURL(/clientId=/);
    await expect(linhas.first()).toBeVisible();
    const n = await linhas.count();
    expect(n).toBeGreaterThan(1);
    const soma2 = (await linhas.locator("td:nth-child(5)").allTextContents())
      .map(centavos)
      .reduce((a, b) => a + b, 0);
    expect(centavos(await page.getByTestId("total-filtro").innerText())).toBe(soma2);
    const cards2 = (await page.getByTestId("card-valor").allTextContents())
      .map(centavos)
      .reduce((a, b) => a + b, 0);
    expect(cards2).toBe(soma2);

    // exportacoes respeitam os filtros da URL
    const [xlsx] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Excel" }).click(),
    ]);
    expect(xlsx.suggestedFilename()).toMatch(/^relatorio-financeiro-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const [pdf] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "PDF" }).click(),
    ]);
    expect(pdf.suggestedFilename()).toMatch(/^relatorio-financeiro-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  test("operacional só acessa o relatório de medições", async ({ page }) => {
    await login(page, "operacional");
    await page.goto("/relatorios");
    await expect(page.getByRole("link", { name: "Medições" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("link", { name: "Financeiro" })).toHaveCount(0);
    await expect(page.getByRole("table", { name: "Relatório de Medições" })).toBeVisible();
    await page.goto("/relatorios?tipo=faturamento");
    await expect(page.getByText("Sem permissão")).toBeVisible();
  });
});

test.describe("busca global", () => {
  test("encontra por número, FRS, NF e cliente; o cliente não vê outros clientes", async ({
    page,
  }) => {
    await login(page, "admin");
    const busca = page.getByRole("searchbox", { name: "Busca global" });
    await busca.fill("BM-2026-0001");
    await busca.press("Enter");
    await expect(page).toHaveURL(/\/busca\?q=BM-2026-0001/);
    await expect(page.getByTestId("grupo-medições")).toContainText("BM-2026-0001");
    await expect(page.getByTestId("grupo-medições")).toContainText("Encontrado por: Número");

    await page.goto("/busca?q=001181"); // NF do seed
    await expect(page.getByTestId("grupo-notas-fiscais")).toContainText("NF 001181");

    await page.goto("/busca?q=serra");
    await expect(page.getByTestId("grupo-clientes")).toContainText("Serra Azul Mineração");
    await expect(page.getByTestId("grupo-contratos")).toContainText("CT-2025-014");
    await expect(page.getByTestId("grupo-medições")).toContainText("Encontrado por: Cliente");

    await page.goto("/busca?q=x");
    await expect(page.getByText("Digite ao menos 2 caracteres")).toBeVisible();

    await login(page, "cliente");
    await page.goto("/busca?q=vale");
    await expect(page.getByText(/Nada encontrado para/)).toBeVisible();
    await page.goto("/busca?q=BM-2026-0004");
    await expect(page.getByTestId("grupo-medições")).toContainText("BM-2026-0004");
    await expect(page.getByTestId("grupo-clientes")).toHaveCount(0);
  });

  test("detalhe do cliente mostra a visão individual das medições", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/clientes");
    await page.getByRole("row").filter({ hasText: "Norte Industrial" }).first().click();
    await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]{36}$/);
    const resumo = page.getByTestId("resumo-medicoes");
    await expect(resumo).toContainText(/\d+ medições ativas/);
    await expect(resumo).toContainText("BM-2026-0009");
    await resumo.getByRole("link", { name: "Ver todas" }).click();
    await expect(page).toHaveURL(/\/medicoes\?clientId=/);
    await expect(page.getByRole("table", { name: "Lista de boletins de medição" })).toContainText(
      "Norte Industrial",
    );
  });
});
