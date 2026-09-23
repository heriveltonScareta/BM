import { expect, test } from "@playwright/test";
import { cnpjAleatorio, login } from "./helpers";

test.describe("clientes", () => {
  test("lista seedada, busca e filtro server-side", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/clientes");
    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
    const tabela = page.getByRole("table", { name: "Lista de clientes" });
    for (const codigo of ["MSA", "CVF", "SNI"]) await expect(tabela).toContainText(codigo);
    await page.getByLabel("Buscar").fill("serra");
    await expect(page).toHaveURL(/q=serra/);
    await expect(tabela.getByRole("row")).toHaveCount(2);
    await expect(tabela).toContainText("Serra Azul");
    await page.getByLabel("Limpar busca").click();
    await expect(page).not.toHaveURL(/q=/);
    await expect(tabela).toContainText("CVF");
    // ordenação pela coluna Código, desc
    await page.getByRole("button", { name: "Código" }).click();
    await expect(page).toHaveURL(/sort=code&order=asc/);
    await expect(tabela.getByRole("row").nth(1)).toContainText("CVF");
    await page.getByRole("button", { name: "Código" }).click();
    await expect(page).toHaveURL(/sort=code&order=desc/);
    await expect(tabela.getByRole("row").nth(1)).toContainText("SNI");
  });

  test("admin cria, edita, gerencia contatos/contratos, inativa e exclui", async ({ page }) => {
    const codigo = `E2E${Date.now().toString().slice(-6)}`;
    const cnpj = cnpjAleatorio();
    await login(page, "admin");
    await page.goto("/clientes");
    await page.getByRole("link", { name: "Novo cliente" }).click();
    await expect(page).toHaveURL(/\/clientes\/novo/);

    await page.getByLabel("Código").fill(codigo);
    await page.getByLabel("CNPJ").fill("11222333000182"); // DV errado
    await expect(page.getByLabel("CNPJ")).toHaveValue("11.222.333/0001-82"); // máscara
    await page.getByLabel("Nome fantasia").fill("Pedreira E2E");
    await page.getByLabel("Razão social").fill("Pedreira E2E Mineração Ltda");
    await page.getByRole("button", { name: "Cadastrar cliente" }).click();
    await expect(page.getByText("CNPJ inválido.")).toBeVisible();
    await expect(page).toHaveURL(/\/clientes\/novo/);

    await page.getByLabel("CNPJ").fill(cnpj);
    await page.getByRole("button", { name: "Cadastrar cliente" }).click();
    await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Pedreira E2E" })).toBeVisible();
    await expect(page.getByText("Ativo", { exact: true })).toBeVisible();

    // editar
    await page.getByRole("link", { name: "Editar" }).click();
    await page.getByLabel("Nome fantasia").fill("Pedreira E2E Editada");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByRole("heading", { name: "Pedreira E2E Editada" })).toBeVisible();

    // contato aprovador
    await page.getByRole("button", { name: "Adicionar contato" }).click();
    await page.getByLabel("Nome").fill("Maria Aprovadora");
    await page.getByLabel("E-mail").fill("maria@e2e.local");
    await page.getByLabel("Aprovador de medições").check();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Maria Aprovadora")).toBeVisible();
    await expect(page.getByText("Aprovador", { exact: true })).toBeVisible();

    // contrato
    await page.getByRole("button", { name: "Adicionar contrato" }).click();
    await page.getByLabel("Código").fill("ct-e2e");
    await page.getByLabel("Unidade").fill("Pedreira Norte");
    await page.getByLabel("Objeto do contrato").fill("Britagem e carregamento");
    await page.getByLabel("Início").fill("2026-01-15");
    await page.getByLabel("Término (opcional)").fill("2025-12-31");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(
      page.getByText("A data de término deve ser igual ou posterior ao início."),
    ).toBeVisible();
    await page.getByLabel("Término (opcional)").fill("");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("CT-E2E")).toBeVisible();
    await expect(page.getByText("15/01/2026")).toBeVisible();

    // inativar
    await page.getByRole("button", { name: "Inativar" }).click();
    await page.getByRole("button", { name: "Inativar" }).last().click();
    await expect(page.getByText("Inativo", { exact: true })).toBeVisible();
    await page.goto("/clientes?status=ativos");
    await expect(page.getByRole("table")).not.toContainText(codigo);
    await page.goto("/clientes?status=inativos");
    await expect(page.getByRole("table")).toContainText(codigo);

    // excluir (sem medições)
    await page.getByRole("table").getByRole("row").filter({ hasText: codigo }).click();
    await page.getByRole("button", { name: "Excluir" }).click();
    await page.getByRole("button", { name: "Excluir" }).last().click();
    await expect(page).toHaveURL(/\/clientes$/);
    await expect(page.getByRole("table")).not.toContainText(codigo);
  });

  test("cliente com medições não pode ser excluído, só inativado", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/clientes?q=serra");
    await page.getByRole("table").getByRole("row").filter({ hasText: "Serra Azul" }).click();
    await expect(page.getByRole("heading", { name: "Serra Azul Mineração" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Excluir" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Inativar" })).toBeVisible();
  });

  test("operacional vê a lista mas não cria; cliente não acessa", async ({ page }) => {
    await login(page, "operacional");
    await page.goto("/clientes");
    await expect(page.getByRole("table", { name: "Lista de clientes" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Novo cliente" })).toHaveCount(0);
    await page.goto("/clientes/novo");
    await expect(page.getByRole("heading", { name: "Sem permissão" })).toBeVisible();
  });

  test("perfil cliente não acessa o cadastro de clientes", async ({ page }) => {
    await login(page, "cliente");
    await page.goto("/clientes");
    await expect(page.getByRole("heading", { name: "Sem permissão" })).toBeVisible();
  });

  test("id inexistente retorna página não encontrada", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/clientes/0199c000-0000-7000-8000-000000000000");
    await expect(page.getByText("Página não encontrada")).toBeVisible();
  });
});

test.describe("clientes @mobile", () => {
  test("lista vira cards sem rolagem horizontal @mobile", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/clientes");
    await expect(page.getByRole("list", { name: "Lista de clientes" })).toBeVisible();
    await expect(page.getByRole("table")).toBeHidden();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});
