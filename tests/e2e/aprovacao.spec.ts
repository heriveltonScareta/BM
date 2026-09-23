import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { login } from "./helpers";
import { extractPdfText } from "../setup/pdf-text";

async function prepararMedicao(page: Page): Promise<{ id: string; numero: string }> {
  await page.goto("/medicoes/nova");
  await page.getByRole("combobox", { name: "Cliente" }).click();
  await page.getByRole("option", { name: /Serra Azul/ }).click();
  await page.getByLabel("Competência").fill("09/2026");
  await page.getByLabel("Competência").blur();
  await page.getByLabel("FRS").fill("FRS-APROV");
  await page.getByRole("button", { name: "Criar medição" }).click();
  await expect(page).toHaveURL(/\/medicoes\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;
  const numero = (await page.getByRole("heading", { name: /BM-2026-\d{4}/ }).textContent())!.trim();
  const r = await page.request.post(`/api/medicoes/${id}/itens/mao-de-obra`, {
    data: { code: "MO-1", role: "Blaster", quantity: "10", unit: "h", unitPrice: "55" },
  });
  expect(r.status()).toBe(201);
  expect(
    (
      await page.request.post(`/api/medicoes/${id}/status`, { data: { to: "EM_ELABORACAO" } })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post(`/api/medicoes/${id}/status`, { data: { to: "AGUARDANDO_ENVIO" } })
    ).status(),
  ).toBe(200);
  return { id, numero };
}

async function enviarPelaTela(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Enviar ao cliente" }).click();
  await expect(page.getByRole("combobox", { name: "Aprovador" })).toContainText("Carla Menezes");
  await page.getByRole("button", { name: "Enviar ao cliente" }).last().click();
  const link = (await page.getByTestId("portal-url").textContent())!.trim();
  expect(link).toMatch(/\/portal\/aprovacao\/[A-Za-z0-9_-]{43}$/);
  await page.getByRole("button", { name: "Fechar" }).click();
  return link;
}

test.describe("aprovação e assinatura", () => {
  test("ciclo completo: enviar → correção → nova versão → reenviar → aprovar → assinar, com histórico e versões", async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000);
    await login(page, "admin");
    const { id, numero } = await prepararMedicao(page);
    await page.reload();

    // envio v1
    const linkV1 = await enviarPelaTela(page);
    await expect(page.getByText("Enviado ao cliente", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Enviado para Carla Menezes" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Adicionar linha" })).toHaveCount(0); // itens bloqueados

    // cliente (sem sessão) abre o link e solicita correção
    const cliente = await browser.newContext();
    const portal = await cliente.newPage();
    await portal.goto(linkV1);
    await expect(
      portal.getByRole("heading", { name: `Boletim de Medição ${numero}` }),
    ).toBeVisible();
    await expect(portal.getByTestId("portal-total")).toHaveText(/R\$\s?550,00/);
    await expect(portal.getByText("Sua decisão")).toBeVisible();
    await expect(portal.getByRole("button", { name: "Solicitar correção" })).toBeDisabled();
    await portal
      .getByLabel(/Comentário/)
      .fill("Rever as horas do blaster: registro de campo aponta 8 h.");
    await portal.getByRole("button", { name: "Solicitar correção" }).click();
    await portal.getByRole("button", { name: "Enviar solicitação" }).click();
    await expect(portal.getByText(/Correção solicitada em/)).toBeVisible();

    // link usado: segunda decisão é rejeitada
    const usado = await portal.request.post(`/api/portal/${linkV1.split("/").pop()}/decidir`, {
      data: { decision: "APROVAR", comment: "" },
    });
    expect(usado.status()).toBe(409);
    await portal.reload();
    await expect(portal.getByText(/Correção solicitada em/)).toBeVisible();

    // admin vê o pedido, abre nova versão, corrige e reenvia (v2)
    await page.reload();
    await expect(page.getByText("Correção solicitada", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "registro de campo aponta 8 h" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Corrigir (nova versão)" }).click();
    await page.getByRole("button", { name: "Abrir para correção" }).click();
    await expect(page.getByText("Em elaboração", { exact: true })).toBeVisible();
    const itens = (await (await page.request.get(`/api/medicoes/${id}`)).json()) as {
      laborItems: Array<{ id: string }>;
    };
    expect(
      (
        await page.request.patch(
          `/api/medicoes/${id}/itens/mao-de-obra/${itens.laborItems[0]!.id}`,
          { data: { code: "MO-1", role: "Blaster", quantity: "8", unit: "h", unitPrice: "55" } },
        )
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.post(`/api/medicoes/${id}/status`, { data: { to: "AGUARDANDO_ENVIO" } })
      ).status(),
    ).toBe(200);
    await page.reload();
    const linkV2 = await enviarPelaTela(page);
    expect(linkV2).not.toBe(linkV1);
    await expect(page.getByRole("status").filter({ hasText: "versão 2" })).toBeVisible();

    // v1 substituída
    await portal.goto(linkV1);
    await expect(portal.getByText(/foi substituída/)).toBeVisible();

    // versões: 2 registradas, comparação mostra a diferença
    await page.getByRole("tab", { name: /Versões/ }).click();
    const versoes = page.getByRole("list", { name: "Versões da medição" });
    await expect(versoes.getByRole("listitem")).toHaveCount(2);
    await expect(versoes).toContainText("Versão 2");
    await expect(versoes).toContainText("Vigente");
    await expect(versoes).toContainText("Correção solicitada");
    await page.getByRole("button", { name: "Comparar" }).click();
    const cmp = page.getByTestId("comparacao");
    await expect(cmp).toContainText("Total da medição");
    await expect(cmp).toContainText("R$ 550,00");
    await expect(cmp).toContainText("R$ 440,00");
    await expect(cmp).toContainText("1 alterado(s)");
    await expect(cmp).toContainText("Quantidade 10 → 8");

    // reenvio gera novo link e invalida o anterior
    await page.getByRole("button", { name: "Reenviar link" }).click();
    await page.getByRole("button", { name: "Reenviar", exact: true }).click();
    const linkV2b = (await page.getByTestId("portal-url").textContent())!.trim();
    expect(linkV2b).not.toBe(linkV2);
    await page.getByRole("button", { name: "Fechar" }).click();
    await portal.goto(linkV2);
    await expect(portal.getByRole("heading", { name: "Link expirado" })).toBeVisible();

    // cliente aprova e assina
    await portal.goto(linkV2b);
    await expect(portal.getByTestId("portal-total")).toHaveText(/R\$\s?440,00/);
    await portal.getByRole("button", { name: "Aprovar medição" }).click();
    await portal.getByRole("button", { name: "Confirmar aprovação" }).click();
    await expect(portal.getByText(/Medição aprovada — assine para concluir/)).toBeVisible();
    await expect(portal.getByRole("button", { name: "Assinar eletronicamente" })).toBeDisabled();
    await portal.getByLabel("Nome completo").fill("Carla Menezes Silva");
    await portal.getByLabel("Declaro ciência").check();
    await portal.getByRole("button", { name: "Assinar eletronicamente" }).click();
    await expect(
      portal.getByText(/Boletim assinado eletronicamente por Carla Menezes Silva/),
    ).toBeVisible();
    await expect(portal.getByText(/ICP-Brasil/).first()).toBeVisible();
    const pdfAssinado = await portal.request.get(`/api/portal/${linkV2b.split("/").pop()}/pdf`);
    expect(pdfAssinado.status()).toBe(200);
    expect(pdfAssinado.headers()["content-disposition"]).toMatch(/-v2-assinado\.pdf/);
    const { text } = await extractPdfText(await pdfAssinado.body());
    expect(text).toMatch(/Evidências da assinatura eletrônica/i);
    expect(text).toContain("Carla Menezes Silva");
    expect(text).not.toContain("RASCUNHO");
    expect(text).not.toContain("certificado");
    // assinar de novo é rejeitado
    expect(
      (
        await portal.request.post(`/api/portal/${linkV2b.split("/").pop()}/assinar`, {
          data: { signerName: "Outra", accepted: true },
        })
      ).status(),
    ).toBe(409);
    await cliente.close();

    // admin: evidências, PDF assinado e histórico completo
    await page.reload();
    await expect(page.getByText("Assinado", { exact: true })).toBeVisible();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Assinado eletronicamente por Carla Menezes Silva" }),
    ).toBeVisible();
    const docLink = page.getByRole("link", { name: "PDF assinado" });
    await expect(docLink).toBeVisible();
    const docRes = await page.request.get((await docLink.getAttribute("href"))!);
    expect(docRes.status()).toBe(200);
    expect(docRes.headers()["content-type"]).toBe("application/pdf");
    await page.getByRole("tab", { name: "Histórico" }).click();
    const historico = page.getByRole("list", { name: "Histórico da medição" });
    for (const evento of [
      "Enviado ao cliente",
      "Aberto pelo cliente",
      "Correção solicitada pelo cliente",
      "Versão congelada",
      "Aprovado pelo cliente",
      "Assinado eletronicamente",
    ]) {
      await expect(historico).toContainText(evento);
    }

    // fila de aprovações não lista mais a medição assinada
    await page.goto(`/aprovacoes?q=${numero}`);
    await expect(page.getByText("Nenhuma medição encontrada")).toBeVisible();

    // link expirado e link inválido
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query(
      `UPDATE "ApprovalRequest" SET "expiresAt" = now() - interval '1 minute' WHERE "measurementId" = $1`,
      [id],
    );
    await db.end();
    await page.goto(linkV2b);
    await expect(page.getByRole("heading", { name: "Link expirado" })).toBeVisible();
    await page.goto("/portal/aprovacao/" + "x".repeat(43));
    await expect(page.getByRole("heading", { name: "Link inválido" })).toBeVisible();
    await page.goto("/portal/aprovacao/curto");
    await expect(page.getByRole("heading", { name: "Link inválido" })).toBeVisible();
  });

  test("operacional não envia; cliente logado vê a medição assinada só para leitura", async ({
    page,
  }) => {
    await login(page, "operacional");
    await page.goto("/medicoes?q=BM-2026-0009");
    await page.getByRole("row").filter({ hasText: "BM-2026-0009" }).click();
    await expect(page).toHaveURL(/\/medicoes\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Aguardando envio", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar ao cliente" })).toHaveCount(0);
    const id = page.url().split("/").pop()!;
    expect((await page.request.post(`/api/medicoes/${id}/enviar`, { data: {} })).status()).toBe(
      403,
    );

    await login(page, "cliente");
    await page.goto("/medicoes?q=BM-2026-0004");
    await page.getByRole("row").filter({ hasText: "BM-2026-0004" }).click();
    await expect(page).toHaveURL(/\/medicoes\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Assinado", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Assinado eletronicamente por" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Reenviar link" })).toHaveCount(0);
    await page.getByRole("tab", { name: /Versões/ }).click();
    await expect(
      page.getByRole("list", { name: "Versões da medição" }).getByRole("listitem"),
    ).toHaveCount(2);
  });
});
