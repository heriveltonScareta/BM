import { expect, test } from "@playwright/test";
import { login, USUARIOS, type Perfil } from "./helpers";

test.describe("autenticação", () => {
  test("rota protegida redireciona para o login sem sessão", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/medicoes/nova");
    await expect(page).toHaveURL(/\/login/);
  });

  test("senha errada exibe erro e não autentica", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(USUARIOS.admin.email);
    await page.getByLabel("Senha").fill("senha-errada");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("E-mail ou senha incorretos")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  for (const perfil of Object.keys(USUARIOS) as Perfil[]) {
    test(`login como ${perfil} mostra o dashboard e o perfil no menu`, async ({ page }) => {
      await login(page, perfil);
      const usuario = page.getByRole("button", { name: "Menu do usuário" });
      await expect(usuario).toContainText(USUARIOS[perfil].nome);
      await expect(usuario).toContainText(USUARIOS[perfil].perfil);
    });
  }

  test("menu respeita as permissões do perfil", async ({ page }) => {
    await login(page, "financeiro");
    const nav = page.getByRole("navigation", { name: "Menu principal" });
    await expect(nav.getByRole("link", { name: "Faturamento" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Nova Medição" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Configurações" })).toHaveCount(0);
  });

  test("perfil sem permissão acessando a rota direto vê 'Sem permissão'", async ({ page }) => {
    await login(page, "operacional");
    await page.goto("/faturamento");
    await expect(page.getByRole("heading", { name: "Sem permissão" })).toBeVisible();
  });

  test("logout encerra a sessão", async ({ page }) => {
    await login(page, "admin");
    await page.getByRole("button", { name: "Menu do usuário" }).click();
    await page.getByRole("menuitem", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login já autenticado redireciona para o dashboard", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe("responsividade @mobile", () => {
  test("layout em celular não gera rolagem horizontal e o menu abre @mobile", async ({ page }) => {
    await login(page, "admin");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await page.getByRole("button", { name: "Abrir ou recolher o menu" }).click();
    await expect(page.getByRole("link", { name: "Boletins de Medição" }).first()).toBeVisible();
  });
});
