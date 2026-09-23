import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

async function criarMedicao(page: Page, frs: string) {
  await page.goto("/medicoes/nova");
  await page.getByRole("combobox", { name: "Cliente" }).click();
  await page.getByRole("option", { name: /Serra Azul/ }).click();
  await expect(page.getByRole("combobox", { name: "Contrato" })).toContainText("CT-2025-014");
  await page.getByLabel("Competência").fill("08/2026");
  await page.getByLabel("Competência").blur();
  await expect(page.getByLabel("Início do período")).toHaveValue("2026-08-01");
  await expect(page.getByLabel("Fim do período")).toHaveValue("2026-08-31");
  await page.getByLabel("FRS").fill(frs);
  await page.getByLabel("Pedido de Compra (PC)").fill("PC-E2E");
  await page.getByRole("button", { name: "Criar medição" }).click();
  await expect(page).toHaveURL(/\/medicoes\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

test.describe("medições", () => {
  test("lista seedada com filtros por status e busca por FRS", async ({ page }) => {
    await login(page, "operacional");
    await page.goto("/medicoes?sort=number&order=asc");
    const tabela = page.getByRole("table", { name: "Lista de boletins de medição" });
    await expect(tabela).toContainText("BM-2026-0001");
    await page.getByRole("combobox", { name: "Status" }).click();
    await page.getByRole("option", { name: "Faturado" }).click();
    await expect(page).toHaveURL(/status=FATURADO/);
    await expect(tabela.getByRole("row")).toHaveCount(2);
    await page.goto("/medicoes?q=FRS-2026-0715");
    await expect(tabela.getByRole("row")).toHaveCount(2);
    await expect(tabela).toContainText("BM-2026-0004");
  });

  test("operacional cria medição, lança 20 itens, recarrega e edita com recálculo no servidor", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await login(page, "operacional");
    const id = await criarMedicao(page, `FRS-E2E-${Date.now().toString().slice(-5)}`);
    await expect(page.getByRole("heading", { name: /BM-2026-\d{4}/ })).toBeVisible();
    await expect(page.getByText("Rascunho")).toBeVisible();

    // 1 linha de mão de obra pela grade (inline)
    await page.getByRole("button", { name: "Adicionar linha" }).click();
    const funcao = page.getByRole("textbox", { name: /^Função do item/ }).first();
    await expect(funcao).toBeFocused();
    await funcao.fill("Blaster");
    await page
      .getByRole("textbox", { name: /^Quantidade do item/ })
      .first()
      .fill("10,5");
    await page
      .getByRole("textbox", { name: /^Valor unitário do item/ })
      .first()
      .fill("55,10");
    await page
      .getByRole("textbox", { name: /^Valor unitário do item/ })
      .first()
      .press("Tab");
    // 10,5 x 55,10 = 578,55
    await expect(page.getByTestId("total-medicao")).toHaveText(/578,55/);

    // demais 19 itens pela API (mesma sessão do navegador)
    for (let i = 2; i <= 10; i++) {
      const r = await page.request.post(`/api/medicoes/${id}/itens/mao-de-obra`, {
        data: {
          code: `MO-${i}`,
          role: `Função ${i}`,
          quantity: "100",
          unit: "h",
          unitPrice: "10,005",
        },
      });
      expect(r.status()).toBe(201);
    }
    for (let i = 1; i <= 10; i++) {
      const r = await page.request.post(`/api/medicoes/${id}/itens/equipamentos`, {
        data: {
          code: `EQ-${i}`,
          name: `Equipamento ${i}`,
          quantity: "3",
          unit: "dia",
          unitPrice: "1.234,565",
        },
      });
      expect(r.status()).toBe(201);
    }

    // recarregar mantém tudo e os totais batem:
    // MO = 578,55 + 9 x 1000,50 (100 x 10,005 = 1000,5) = 9583,05 ; EQ = 10 x 3703,70 = 37037,00 ; total 46620,05
    await page.reload();
    await expect(page.getByRole("tab", { name: /Mão de Obra/ })).toContainText("10");
    await expect(page.getByRole("tab", { name: /Equipamentos/ })).toContainText("10");
    await expect(page.getByTestId("total-medicao")).toHaveText(/46\.620,05/);
    await expect(page.getByText("R$ 9.583,05").first()).toBeVisible();

    // editar item inline recalcula no servidor (quantidade 10,5 -> 1)
    const qtd = page.getByRole("textbox", { name: "Quantidade do item MO-001" });
    await qtd.fill("1");
    await qtd.press("Enter");
    // 1 x 55,10 = 55,10 ; total = 46620,05 - 578,55 + 55,10 = 46096,60
    await expect(page.getByTestId("total-medicao")).toHaveText(/46\.096,60/);
    await page.reload();
    await expect(page.getByTestId("total-medicao")).toHaveText(/46\.096,60/);

    // valor inválido mostra erro sem quebrar a grade
    const preco = page.getByRole("textbox", { name: "Valor unitário do item MO-001" });
    await preco.fill("abc");
    await preco.press("Tab");
    await expect(
      page.getByRole("alert").filter({ hasText: "Informe um número válido." }),
    ).toBeVisible();
    await preco.fill("55,10");
    await preco.press("Tab");
    await expect(
      page.getByRole("alert").filter({ hasText: "Informe um número válido." }),
    ).toHaveCount(0);

    // duplicar e excluir
    await page.getByRole("button", { name: "Duplicar item" }).first().click();
    await expect(page.getByRole("tab", { name: /Mão de Obra/ })).toContainText("11");
    await expect(page.getByTestId("total-medicao")).toHaveText(/46\.151,70/);
    await page.getByRole("button", { name: "Excluir item" }).nth(1).click();
    await expect(page.getByRole("tab", { name: /Mão de Obra/ })).toContainText("10");
    await expect(page.getByTestId("total-medicao")).toHaveText(/46\.096,60/);

    // ajustes do total pelo cabeçalho
    await page.getByRole("tab", { name: "Dados e ajustes" }).click();
    await page.getByLabel("Descontos").fill("96,60");
    await page.getByLabel("Impostos").fill("1.000,00");
    await page.getByRole("button", { name: "Salvar dados" }).click();
    await expect(page.getByTestId("total-medicao")).toHaveText(/47\.000,00/);

    // status: iniciar elaboração -> pronta para envio; operacional não cancela
    await page.getByRole("button", { name: "Iniciar elaboração" }).click();
    await expect(page.getByText("Em elaboração", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancelar medição" })).toHaveCount(0);
    await page.getByRole("button", { name: "Pronta para envio" }).click();
    await page.getByRole("button", { name: "Marcar como pronta" }).click();
    await expect(page.getByText("Aguardando envio", { exact: true })).toBeVisible();

    // histórico registra os eventos
    await page.getByRole("tab", { name: "Histórico" }).click();
    const historico = page.getByRole("list", { name: "Histórico da medição" });
    await expect(historico).toContainText("Medição criada");
    await expect(historico).toContainText("Item adicionado");
    await expect(historico).toContainText("Em elaboração → Aguardando envio");
  });

  test("admin cancela com motivo e a medição fica bloqueada", async ({ page }) => {
    await login(page, "admin");
    const id = await criarMedicao(page, "FRS-CANCEL");
    await page.getByRole("button", { name: "Cancelar medição" }).click();
    await expect(page.getByRole("button", { name: "Cancelar medição" }).last()).toBeDisabled();
    await page.getByLabel("Motivo (obrigatório)").fill("Criada por engano");
    await page.getByRole("button", { name: "Cancelar medição" }).last().click();
    await expect(page.getByText("Cancelado", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Adicionar linha" })).toHaveCount(0);
    const r = await page.request.post(`/api/medicoes/${id}/itens/mao-de-obra`, {
      data: { code: "X", role: "X", quantity: "1", unit: "h", unitPrice: "1" },
    });
    expect(r.status()).toBe(409);
  });

  test("financeiro não cria medição nem vê rascunhos; cliente só vê as suas", async ({ page }) => {
    await login(page, "financeiro");
    await page.goto("/medicoes/nova");
    await expect(page.getByRole("heading", { name: "Sem permissão" })).toBeVisible();
    await page.goto("/medicoes?sort=number&order=asc");
    const tabela = page.getByRole("table", { name: "Lista de boletins de medição" });
    await expect(tabela).toContainText("BM-2026-0001");
    await expect(tabela).not.toContainText("Rascunho");
    await expect(tabela).not.toContainText("Em elaboração");
  });

  test("cliente vê apenas medições do próprio cliente enviadas em diante", async ({ page }) => {
    await login(page, "cliente");
    await page.goto("/medicoes");
    const tabela = page.getByRole("table", { name: "Lista de boletins de medição" });
    await expect(tabela).toContainText("Serra Azul");
    await expect(tabela).not.toContainText("Vale Forte");
    await expect(tabela).not.toContainText("Norte Industrial");
    await expect(tabela).not.toContainText("Em elaboração");
    // BM-2026-0002 pertence a Vale Forte: 404
    const r = await page.request.get("/api/medicoes?q=BM-2026-0002");
    expect(((await r.json()) as { total: number }).total).toBe(0);
  });
});

test.describe("medições @mobile", () => {
  test("grade vira cards editáveis no celular @mobile", async ({ page }) => {
    await login(page, "operacional");
    await page.goto("/medicoes?q=BM-2026-0010");
    await page.getByRole("link", { name: /BM-2026-0010/ }).click();
    await expect(page.getByRole("list", { name: "Itens de função" })).toBeVisible();
    await expect(page.getByRole("table")).toBeHidden();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});
