import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../setup/db";
import { createTestUsers } from "../setup/session";
import { CNPJ_A, CNPJ_B, createClientFixture } from "../setup/fixtures";
import { PDF_MIN, PNG_MIN, XML_MIN } from "../setup/files";
import {
  addItem,
  createMeasurement,
  transitionMeasurement,
} from "@/lib/services/measurement.service";
import {
  attachInvoice,
  getBillingInfo,
  markInvoiced,
  releaseForBilling,
  updateInvoiceStatus,
  divergenceAlert,
} from "@/lib/services/billing.service";
import {
  getDocumentForDownload,
  listDocuments,
  removeDocument,
  uploadMeasurementDocument,
} from "@/lib/services/document.service";
import { createMeasurementSchema, laborItemSchema } from "@/lib/validation/measurement";
import { invoiceSchema, invoiceStatusSchema } from "@/lib/validation/invoice";
import { MeasurementStatus as S } from "@/lib/db/generated/enums";
import { NotFoundError, TransitionError, ValidationError } from "@/lib/errors";
import type { Scope } from "@/lib/auth/scope";

const ALL: Scope = { kind: "ALL" };
const actor = { label: "teste" };

describe("faturamento e documentos", () => {
  let users: Awaited<ReturnType<typeof createTestUsers>>;
  let a: Awaited<ReturnType<typeof createClientFixture>>;
  let b: Awaited<ReturnType<typeof createClientFixture>>;
  let id = "";

  beforeAll(async () => {
    await resetDatabase();
    a = await createClientFixture("AAA", CNPJ_A);
    b = await createClientFixture("BBB", CNPJ_B);
    users = await createTestUsers(a.client.id);
    const m = await createMeasurement(
      users.admin,
      createMeasurementSchema.parse({
        clientId: a.client.id,
        contractId: a.contract.id,
        competence: "09/2026",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        issueDate: "2026-09-30",
      }),
      actor,
    );
    id = m.id;
    await addItem(
      ALL,
      id,
      "mao-de-obra",
      laborItemSchema.parse({
        code: "MO-1",
        role: "Blaster",
        quantity: "10",
        unit: "h",
        unitPrice: "100",
      }),
      actor,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function fakeSignedVersion(measurementId: string, version: number) {
    const v = await prisma.measurementVersion.create({
      data: { measurementId, version, snapshot: {}, createdByUserId: users.admin.id },
    });
    const req = await prisma.approvalRequest.create({
      data: {
        measurementId,
        versionId: v.id,
        tokenHash: `hash-${measurementId}-${version}`,
        expiresAt: new Date(),
        sentToEmail: "x@x",
        sentToName: "X",
        decision: "APPROVED",
        decidedAt: new Date(),
        usedAt: new Date(),
      },
    });
    return prisma.signature.create({
      data: {
        measurementId,
        versionId: v.id,
        approvalRequestId: req.id,
        signerName: "X",
        signerEmail: "x@x",
        ipAddress: "1.1.1.1",
        userAgent: "t",
        documentHash: "h".repeat(64),
      },
    });
  }

  it("não libera sem assinatura da versão vigente; operacional não libera; com assinatura libera", async () => {
    await prisma.measurement.update({
      where: { id },
      data: { status: S.ASSINADO, currentVersion: 1 },
    });
    await expect(releaseForBilling(users.financeiro, ALL, id, actor)).rejects.toThrow(
      /sem a assinatura/,
    );
    await fakeSignedVersion(id, 1);
    await expect(releaseForBilling(users.operacional, ALL, id, actor)).rejects.toBeInstanceOf(
      TransitionError,
    );
    const m = await releaseForBilling(users.financeiro, ALL, id, actor);
    expect(m.status).toBe(S.LIBERADO_FATURAMENTO);
    // faturar sem NF e rejeitado (guard TEM_NF_COMPLETA) mesmo forcando o status
    await expect(markInvoiced(users.financeiro, ALL, id, actor)).rejects.toBeInstanceOf(
      TransitionError,
    );
  });

  it("anexar NF valida arquivos e dados, grava documentos, alerta divergência e muda para NF_ANEXADA", async () => {
    const data = invoiceSchema.parse({
      number: "000123",
      series: "1",
      issueDate: "2026-10-01",
      amount: "1.000,00",
    });
    const pdf = { name: "nf.pdf", size: PDF_MIN.length, buffer: PDF_MIN };
    const xml = { name: "nf.xml", size: XML_MIN.length, buffer: XML_MIN };
    await expect(
      attachInvoice(users.operacional, ALL, id, data, { pdf, xml }, actor),
    ).rejects.toBeInstanceOf(TransitionError);
    await expect(
      attachInvoice(users.financeiro, ALL, id, data, { pdf }, actor),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      attachInvoice(
        users.financeiro,
        ALL,
        id,
        data,
        { pdf: { name: "nf.pdf", size: XML_MIN.length, buffer: XML_MIN }, xml },
        actor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      attachInvoice(
        users.financeiro,
        ALL,
        id,
        data,
        { pdf, xml: { name: "nf.xml", size: PDF_MIN.length, buffer: PDF_MIN } },
        actor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      attachInvoice(
        users.financeiro,
        ALL,
        id,
        data,
        { pdf: { name: "nf.exe", size: 3, buffer: Buffer.from("MZ\0") }, xml },
        actor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(
      invoiceSchema.safeParse({ number: "", issueDate: "2026-10-01", amount: "0" }).success,
    ).toBe(false);

    const r = await attachInvoice(users.financeiro, ALL, id, data, { pdf, xml }, actor);
    expect(r.invoice.number).toBe("000123");
    expect(r.alert).toBeNull();
    const info = await getBillingInfo(ALL, id);
    expect(info.status).toBe(S.NF_ANEXADA);
    expect(info.invoice?.pdfDocument?.fileName).toBe("nf.pdf");
    expect(info.invoice?.xmlDocument?.fileName).toBe("nf.xml");
    const doc = await getDocumentForDownload(ALL, info.invoice!.xmlDocument!.id);
    expect(doc.data.equals(XML_MIN)).toBe(true);
    expect(doc.doc.mimeType).toBe("application/xml");

    // substituir a NF com valor divergente -> alerta (nao bloqueia); documento antigo sai de cena
    const r2 = await attachInvoice(
      users.admin,
      ALL,
      id,
      invoiceSchema.parse({ number: "000124", issueDate: "2026-10-02", amount: "950,50" }),
      { pdf },
      actor,
    );
    expect(r2.alert).toMatch(/difere do total.*R\$\s?49,50 a menos/);
    const info2 = await getBillingInfo(ALL, id);
    expect(info2.invoice?.number).toBe("000124");
    expect(info2.invoice?.alert).toMatch(/49,50/);
    await expect(getDocumentForDownload(ALL, info.invoice!.pdfDocument!.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(divergenceAlert("100", "100")).toBeNull();
    expect(divergenceAlert("110", "100")).toMatch(/a mais/);
  });

  it("faturar exige NF completa e registra; status da NF; estorno cancela a NF e volta para elaboração", async () => {
    await expect(markInvoiced(users.operacional, ALL, id, actor)).rejects.toBeInstanceOf(
      TransitionError,
    );
    const r = await markInvoiced(users.financeiro, ALL, id, actor);
    expect(r.measurement.status).toBe(S.FATURADO);
    expect(r.alert).toMatch(/49,50/);
    const inv = await updateInvoiceStatus(
      users.financeiro,
      ALL,
      id,
      invoiceStatusSchema.parse({ status: "ENVIADA", sentAt: "2026-10-05" }),
      actor,
    );
    expect(inv.status).toBe("ENVIADA");
    expect(inv.sentAt?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    await expect(
      updateInvoiceStatus(
        users.operacional,
        ALL,
        id,
        invoiceStatusSchema.parse({ status: "PAGA" }),
        actor,
      ),
    ).rejects.toMatchObject({ status: 403 });
    // NF anexada nao e mais substituivel em FATURADO
    await expect(
      attachInvoice(
        users.admin,
        ALL,
        id,
        invoiceSchema.parse({ number: "x", issueDate: "2026-10-01", amount: "1" }),
        {},
        actor,
      ),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });

    await expect(
      transitionMeasurement(users.financeiro, ALL, id, S.EM_ELABORACAO, actor, { reason: "erro" }),
    ).rejects.toBeInstanceOf(TransitionError);
    const est = await transitionMeasurement(users.admin, ALL, id, S.EM_ELABORACAO, actor, {
      reason: "Valor faturado errado",
    });
    expect(est.status).toBe(S.EM_ELABORACAO);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { measurementId: id } })).status).toBe(
      "CANCELADA",
    );
    const logs = await prisma.auditLog.findMany({ where: { entityId: id, action: "ESTORNO" } });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.after).toMatchObject({ motivo: "Valor faturado errado" });
  });

  it("documentos avulsos: upload validado, listagem por escopo, remoção lógica apenas de OUTRO", async () => {
    const png = await uploadMeasurementDocument(
      users.operacional,
      ALL,
      id,
      { name: "foto campo.png", size: PNG_MIN.length, buffer: PNG_MIN },
      actor,
    );
    expect(png.type).toBe("OUTRO");
    expect(png.fileName).toBe("foto_campo.png");
    expect(png.mimeType).toBe("image/png");
    await expect(
      uploadMeasurementDocument(
        users.operacional,
        ALL,
        id,
        { name: "planilha.xlsx", size: 10, buffer: Buffer.from("PK\u0003\u0004xxxx") },
        actor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      uploadMeasurementDocument(
        users.operacional,
        ALL,
        id,
        { name: "grande.png", size: 6 * 1024 * 1024, buffer: PNG_MIN },
        actor,
      ),
    ).rejects.toThrow(/limite de 5 MB/);

    const cliA: Scope = { kind: "CLIENT", clientId: a.client.id };
    const cliB: Scope = { kind: "CLIENT", clientId: b.client.id };
    await prisma.measurement.update({ where: { id }, data: { status: S.FATURADO } });
    const listaA = await listDocuments(cliA, {
      page: 1,
      pageSize: 50,
      sort: "createdAt",
      order: "desc",
    });
    expect(listaA.items.map((d) => d.type).sort()).toEqual(["NF_PDF", "NF_XML", "OUTRO"]);
    expect(
      (await listDocuments(cliB, { page: 1, pageSize: 50, sort: "createdAt", order: "desc" }))
        .total,
    ).toBe(0);
    expect(
      (
        await listDocuments(ALL, {
          page: 1,
          pageSize: 50,
          sort: "createdAt",
          order: "desc",
          type: "NF_XML",
        })
      ).total,
    ).toBe(1);
    expect(
      (
        await listDocuments(ALL, {
          page: 1,
          pageSize: 50,
          sort: "createdAt",
          order: "desc",
          q: "foto",
        })
      ).total,
    ).toBe(1);
    await expect(getDocumentForDownload(cliB, png.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await getDocumentForDownload(cliA, png.id)).doc.id).toBe(png.id);

    const nfXml = listaA.items.find((d) => d.type === "NF_XML")!;
    await expect(removeDocument(ALL, nfXml.id, actor)).rejects.toMatchObject({
      code: "DOCUMENT_PROTECTED",
    });
    await expect(removeDocument(cliB, png.id, actor)).rejects.toBeInstanceOf(NotFoundError);
    await removeDocument(ALL, png.id, actor);
    await expect(getDocumentForDownload(ALL, png.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(
      (await prisma.document.findUniqueOrThrow({ where: { id: png.id } })).deletedAt,
    ).toBeInstanceOf(Date);
    expect(
      await prisma.auditLog.count({ where: { entityId: png.id, action: "DOCUMENTO_REMOVIDO" } }),
    ).toBe(1);
  });

  it("financeiro só vê medições/documentos de APROVADO em diante; cliente vê NF só da própria medição", async () => {
    const fin: Scope = { kind: "FINANCEIRO" };
    await prisma.measurement.update({ where: { id }, data: { status: S.EM_ELABORACAO } });
    expect(
      (await listDocuments(fin, { page: 1, pageSize: 50, sort: "createdAt", order: "desc" })).total,
    ).toBe(0);
    await expect(getBillingInfo(fin, id)).rejects.toBeInstanceOf(NotFoundError);
    await prisma.measurement.update({ where: { id }, data: { status: S.FATURADO } });
    expect(
      (await listDocuments(fin, { page: 1, pageSize: 50, sort: "createdAt", order: "desc" })).total,
    ).toBe(2);
    expect((await getBillingInfo(fin, id)).invoice?.number).toBe("000124");
  });
});
