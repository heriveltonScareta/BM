import { expect, test } from "@playwright/test";
import { login } from "./helpers";
import { PDF_MIN, XML_MIN } from "../setup/files";

test.describe("faturamento e documentos", () => {
  test("financeiro libera, anexa NF (com alerta de divergência), fatura e atualiza status; documentos aparecem", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await login(page, "financeiro");
    // BM-2026-0004 esta ASSINADO no seed
    await page.goto("/faturamento?q=BM-2026-0004");
    const tabela = page.getByRole("table", { name: "Lista de boletins de medição" });
    await expect(tabela).toContainText("BM-2026-0004");
    await tabela.getByRole("row").filter({ hasText: "BM-2026-0004" }).click();
    await expect(page).toHaveURL(/\/medicoes\/[0-9a-f-]{36}$/);
    const id = page.url().split("/").pop()!;

    await page.getByRole("tab", { name: "Faturamento" }).click();
    await expect(
      page.getByText("A versão vigente está assinada eletronicamente pelo cliente."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Liberar para faturamento" }).click();
    await expect(page.getByText("Liberado p/ faturamento", { exact: true }).first()).toBeVisible();

    // anexar NF: PDF com conteudo errado e rejeitado
    await page.getByRole("tab", { name: "Faturamento" }).click();
    await page.getByLabel("Número da NF").fill("000777");
    await page.getByLabel("Série").fill("1");
    await page.getByLabel("Valor da NF").fill("211.000,00"); // total e 211.250,08 -> divergencia
    await page
      .locator("#nf-pdf")
      .setInputFiles({ name: "nf.pdf", mimeType: "application/pdf", buffer: XML_MIN });
    await page
      .locator("#nf-xml")
      .setInputFiles({ name: "nf.xml", mimeType: "application/xml", buffer: XML_MIN });
    await page.getByRole("button", { name: "Anexar nota fiscal" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "conteúdo do arquivo não corresponde" }),
    ).toBeVisible();

    await page
      .locator("#nf-pdf")
      .setInputFiles({ name: "nf.pdf", mimeType: "application/pdf", buffer: PDF_MIN });
    await page.getByRole("button", { name: "Anexar nota fiscal" }).click();
    await expect(page.getByText("NF anexada", { exact: true }).first()).toBeVisible();
    await page.getByRole("tab", { name: "Faturamento" }).click();
    await expect(page.getByText("Nota fiscal 000777")).toBeVisible();
    await expect(page.getByTestId("nf-valor")).toHaveText(/211\.000,00/);
    await expect(
      page.getByRole("alert").filter({ hasText: /difere do total da medição.*250,08 a menos/ }),
    ).toBeVisible();

    // faturar (confirmacao explicita)
    await page.getByRole("button", { name: "Marcar como faturado" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Atenção");
    await page.getByRole("button", { name: "Faturar" }).click();
    await expect(page.getByText("Faturado", { exact: true }).first()).toBeVisible();
    await page.getByRole("tab", { name: "Faturamento" }).click();
    await expect(page.getByRole("button", { name: "Marcar como faturado" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Substituir NF" })).toHaveCount(0);

    // status da NF
    await page.getByRole("combobox", { name: "Status da NF" }).click();
    await page.getByRole("option", { name: "Enviada ao cliente" }).click();
    await page.getByLabel("Data de envio").fill("2026-10-10");
    await page.getByRole("button", { name: "Salvar status" }).click();
    await page.getByRole("tab", { name: "Faturamento" }).click();
    await expect(page.getByText(/Enviada ao cliente · enviada em 10\/10\/2026/)).toBeVisible();

    // documentos da medicao: boletim, boletim assinado, NF PDF e XML; NF nao pode ser removida
    await page.getByRole("tab", { name: /Documentos/ }).click();
    const docs = page.getByRole("list", { name: "Documentos da medição" });
    await expect(docs).toContainText("Nota fiscal (PDF)");
    await expect(docs).toContainText("Nota fiscal (XML)");
    await expect(docs).toContainText("Boletim assinado");
    await expect(docs.getByRole("button", { name: /Remover/ })).toHaveCount(0);
    const nfLink = docs
      .getByRole("listitem")
      .filter({ hasText: "nf.xml" })
      .getByRole("link", { name: "Baixar" });
    const nfRes = await page.request.get((await nfLink.getAttribute("href"))!);
    expect(nfRes.status()).toBe(200);
    expect(nfRes.headers()["content-type"]).toBe("application/xml");
    expect((await nfRes.body()).equals(XML_MIN)).toBe(true);

    // pagina de documentos lista a NF e filtra por tipo
    await page.goto("/documentos?type=NF_XML");
    await expect(page.getByRole("table", { name: "Lista de documentos" })).toContainText("nf.xml");
    await expect(page.getByRole("tab", { name: "Faturamento" })).toHaveCount(0);

    // historico
    await page.goto(`/medicoes/${id}?aba=historico`);
    const historico = page.getByRole("list", { name: "Histórico da medição" });
    await expect(historico).toContainText("Nota fiscal anexada");
    await expect(historico).toContainText("NF anexada → Faturado");
  });

  test("cliente baixa a NF só da própria medição; operacional não fatura nem vê o menu Faturamento", async ({
    page,
  }) => {
    await login(page, "cliente");
    // BM-2026-0001 (Serra Azul, FATURADO com NF no seed) x BM-2026-0002 (Vale Forte, NF_ANEXADA)
    const propria = (await (await page.request.get("/api/medicoes?q=BM-2026-0001")).json()) as {
      items: Array<{ id: string }>;
    };
    const docsProprios = await page.request.get(`/api/medicoes/${propria.items[0]!.id}/documentos`);
    expect(docsProprios.status()).toBe(200);
    const nf = ((await docsProprios.json()) as Array<{ id: string; type: string }>).find(
      (d) => d.type === "NF_PDF",
    )!;
    expect((await page.request.get(`/api/documentos/${nf.id}/download`)).status()).toBe(200);
    await page.goto("/documentos");
    const tabela = page.getByRole("table", { name: "Lista de documentos" });
    await expect(tabela).toContainText("Serra Azul");
    await expect(tabela).not.toContainText("Vale Forte");
    await expect(tabela).not.toContainText("Norte Industrial");
    // documentos de outro cliente: 404 (id obtido pelo admin)
    await login(page, "admin");
    const outra = (await (await page.request.get("/api/medicoes?q=BM-2026-0002")).json()) as {
      items: Array<{ id: string }>;
    };
    const docsOutra = (await (
      await page.request.get(`/api/medicoes/${outra.items[0]!.id}/documentos`)
    ).json()) as Array<{ id: string; type: string }>;
    const nfOutra = docsOutra.find((d) => d.type === "NF_PDF")!;
    await login(page, "cliente");
    expect((await page.request.get(`/api/documentos/${nfOutra.id}/download`)).status()).toBe(404);
    expect(
      (await page.request.get(`/api/medicoes/${outra.items[0]!.id}/documentos`)).status(),
    ).toBe(404);
    await page.goto(`/medicoes/${propria.items[0]!.id}?aba=faturamento`);
    await expect(page.getByText(/Nota fiscal \d+/)).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Status da NF" })).toHaveCount(0);

    await login(page, "operacional");
    await expect(
      page
        .getByRole("navigation", { name: "Menu principal" })
        .getByRole("link", { name: "Faturamento" }),
    ).toHaveCount(0);
    await page.goto("/faturamento");
    await expect(page.getByRole("heading", { name: "Sem permissão" })).toBeVisible();
    const assinada = (await (await page.request.get("/api/medicoes?q=BM-2026-0003")).json()) as {
      items: Array<{ id: string }>;
    }; // LIBERADO_FATURAMENTO
    expect(
      (await page.request.post(`/api/medicoes/${assinada.items[0]!.id}/faturar`)).status(),
    ).toBe(403);
    expect(
      (await page.request.post(`/api/medicoes/${assinada.items[0]!.id}/liberar`)).status(),
    ).toBe(403);
  });
});
