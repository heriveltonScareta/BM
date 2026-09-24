/**
 * Fase 7 — regressoes dos achados da auditoria final:
 * rota generica de status, ciclo completo apos estorno, concorrencia real nas transicoes,
 * timeline sem dados internos, sessao reconciliada com o banco, limites numericos.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../setup/db";
import { asUser, callRoute, createTestUsers } from "../setup/session";
import { CNPJ_A, CNPJ_B, createClientFixture } from "../setup/fixtures";
import { PDF_MIN, XML_MIN } from "../setup/files";
import {
  addItem,
  createMeasurement,
  getMeasurementTimeline,
  transitionMeasurement,
  updateMeasurementHeader,
} from "@/lib/services/measurement.service";
import {
  decidePortal,
  getPortal,
  getApprovalStatus,
  resendApproval,
  sendToClient,
  signPortal,
} from "@/lib/services/approval.service";
import {
  attachInvoice,
  getBillingInfo,
  markInvoiced,
  releaseForBilling,
  updateInvoiceStatus,
} from "@/lib/services/billing.service";
import { invalidateSessionUser, resolveSessionUser } from "@/lib/services/auth.service";
import { describeFilters } from "@/lib/services/report-filters";
import { getDashboard } from "@/lib/services/report.service";
import {
  createMeasurementSchema,
  laborItemSchema,
  measurementHeaderSchema,
} from "@/lib/validation/measurement";
import { invoiceSchema, invoiceStatusSchema } from "@/lib/validation/invoice";
import { reportFiltersSchema } from "@/lib/validation/report";
import { getScope } from "@/lib/auth/scope";
import { MeasurementStatus as S, InvoiceStatus } from "@/lib/db/generated/enums";
import { AppError, ForbiddenError, TransitionError, ValidationError } from "@/lib/errors";
import { setEmailProviderForTests, type EmailMessage } from "@/lib/email";
import type { Scope } from "@/lib/auth/scope";
import { POST as statusPOST } from "@/app/api/medicoes/[id]/status/route";
import { POST as itensPOST } from "@/app/api/medicoes/[id]/itens/[tipo]/route";
import { GET as timelineGET } from "@/app/api/medicoes/[id]/timeline/route";

const ALL: Scope = { kind: "ALL" };
const actor = { label: "teste" };

describe("fase 7 — auditoria final", () => {
  let users: Awaited<ReturnType<typeof createTestUsers>>;
  let a: Awaited<ReturnType<typeof createClientFixture>>;
  let b: Awaited<ReturnType<typeof createClientFixture>>;
  const sent: EmailMessage[] = [];

  const novaMedicao = async (fx = a) => {
    const m = await createMeasurement(
      users.admin,
      createMeasurementSchema.parse({
        clientId: fx.client.id,
        contractId: fx.contract.id,
        competence: "09/2026",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        issueDate: "2026-09-30",
      }),
      actor,
    );
    await addItem(
      ALL,
      m.id,
      "mao-de-obra",
      laborItemSchema.parse({
        code: "MO",
        role: "Soldador",
        quantity: "2",
        unit: "h",
        unitPrice: "50",
      }),
      actor,
    );
    return m;
  };
  const tokenFromEmail = () => {
    const last = sent[sent.length - 1]!;
    return last.text.match(/\/portal\/aprovacao\/([A-Za-z0-9_-]+)/)![1]!;
  };
  /** RASCUNHO -> ... -> ASSINADO pelo fluxo real (envio, portal, assinatura). */
  const assinar = async (id: string) => {
    await transitionMeasurement(users.admin, ALL, id, S.EM_ELABORACAO, actor);
    await transitionMeasurement(users.admin, ALL, id, S.AGUARDANDO_ENVIO, actor);
    await sendToClient(users.admin, ALL, id, {}, actor);
    const token = tokenFromEmail();
    await decidePortal(token, "APROVAR", "", {});
    await signPortal(token, { signerName: "Aprovador" }, {});
    return token;
  };
  const arquivosNf = () => ({
    pdf: { name: "nf.pdf", size: PDF_MIN.length, buffer: PDF_MIN },
    xml: { name: "nf.xml", size: XML_MIN.length, buffer: XML_MIN },
  });

  beforeAll(async () => {
    await resetDatabase();
    setEmailProviderForTests({
      name: "fake",
      async send(m) {
        sent.push(m);
        return { id: String(sent.length) };
      },
    });
    a = await createClientFixture("AAA", CNPJ_A);
    b = await createClientFixture("BBB", CNPJ_B);
    users = await createTestUsers(a.client.id);
  });

  afterAll(async () => {
    asUser(null);
    setEmailProviderForTests(undefined);
    await prisma.$disconnect();
  });

  it("CLIENTE logado não aprova nem assina pela rota genérica de status (403), mesmo na própria medição", async () => {
    const m = await novaMedicao();
    await transitionMeasurement(users.admin, ALL, m.id, S.EM_ELABORACAO, actor);
    await transitionMeasurement(users.admin, ALL, m.id, S.AGUARDANDO_ENVIO, actor);
    await sendToClient(users.admin, ALL, m.id, {}, actor);
    asUser(users.cliente);
    for (const to of ["EM_APROVACAO", "APROVADO", "CORRECAO_SOLICITADA", "ASSINADO"]) {
      const r = await callRoute(statusPOST, {
        method: "POST",
        path: "/x",
        params: { id: m.id },
        body: { to, reason: "x" },
      });
      expect(r.status, to).toBe(403);
    }
    asUser(null);
    await expect(
      transitionMeasurement(users.cliente, getScope(users.cliente), m.id, S.APROVADO, actor),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const after = await prisma.measurement.findUniqueOrThrow({ where: { id: m.id } });
    expect(after.status).toBe(S.ENVIADO_AO_CLIENTE);
  });

  it("Admin não força APROVADO/ASSINADO/NF_ANEXADA pela rota genérica: cada um tem fluxo próprio (409)", async () => {
    const m = await novaMedicao();
    await transitionMeasurement(users.admin, ALL, m.id, S.EM_ELABORACAO, actor);
    await transitionMeasurement(users.admin, ALL, m.id, S.AGUARDANDO_ENVIO, actor);
    await expect(
      transitionMeasurement(users.admin, ALL, m.id, S.ENVIADO_AO_CLIENTE, actor),
    ).rejects.toThrow(/Enviar ao cliente/);
    await sendToClient(users.admin, ALL, m.id, {}, actor);
    await expect(
      transitionMeasurement(users.admin, ALL, m.id, S.EM_APROVACAO, actor),
    ).rejects.toBeInstanceOf(TransitionError);
    const token = tokenFromEmail();
    await decidePortal(token, "APROVAR", "", {});
    await expect(
      transitionMeasurement(users.admin, ALL, m.id, S.ASSINADO, actor),
    ).rejects.toBeInstanceOf(TransitionError);
    await signPortal(token, { signerName: "A" }, {});
    await releaseForBilling(users.financeiro, getScope(users.financeiro), m.id, actor);
    asUser(users.financeiro);
    const r = await callRoute(statusPOST, {
      method: "POST",
      path: "/x",
      params: { id: m.id },
      body: { to: "NF_ANEXADA" },
    });
    expect(r.status).toBe(409);
    asUser(null);
  });

  it("após estorno, a NF cancelada não vale: novo ciclo exige NF completa (PDF + XML) e nasce EMITIDA", async () => {
    const m = await novaMedicao();
    await assinar(m.id);
    const fin = getScope(users.financeiro);
    await releaseForBilling(users.financeiro, fin, m.id, actor);
    await attachInvoice(
      users.financeiro,
      fin,
      m.id,
      invoiceSchema.parse({ number: "NF-1", issueDate: "2026-09-30", amount: "100,00" }),
      arquivosNf(),
      actor,
    );
    await markInvoiced(users.financeiro, fin, m.id, actor);
    // estorno: NF vira CANCELADA e a medicao volta para elaboracao
    await transitionMeasurement(users.admin, ALL, m.id, S.EM_ELABORACAO, actor, {
      reason: "valor errado",
    });
    const cancelada = await prisma.invoice.findUniqueOrThrow({ where: { measurementId: m.id } });
    expect(cancelada.status).toBe(InvoiceStatus.CANCELADA);
    // status da NF nao pode ser alterado fora de NF_ANEXADA/FATURADO nem sair de CANCELADA
    await expect(
      updateInvoiceStatus(
        users.financeiro,
        ALL,
        m.id,
        invoiceStatusSchema.parse({ status: "PAGA" }),
        actor,
      ),
    ).rejects.toBeInstanceOf(AppError);

    // novo ciclo: assinatura antiga nao vale (guard TEM_ASSINATURA na versao 2)
    await transitionMeasurement(users.admin, ALL, m.id, S.AGUARDANDO_ENVIO, actor);
    await sendToClient(users.admin, ALL, m.id, {}, actor);
    const token = tokenFromEmail();
    await decidePortal(token, "APROVAR", "", {});
    // aprovada (visivel ao financeiro), mas a assinatura da v1 nao vale para a v2
    await expect(releaseForBilling(users.financeiro, fin, m.id, actor)).rejects.toBeInstanceOf(
      TransitionError,
    );
    await signPortal(token, { signerName: "B" }, {});
    await releaseForBilling(users.financeiro, fin, m.id, actor);
    // faturar sem NF nova: recusado (a antiga esta cancelada)
    await expect(markInvoiced(users.financeiro, fin, m.id, actor)).rejects.toBeInstanceOf(
      TransitionError,
    );
    // NF sem arquivos: recusada (a cancelada nao conta como existente)
    await expect(
      attachInvoice(
        users.financeiro,
        fin,
        m.id,
        invoiceSchema.parse({ number: "NF-2", issueDate: "2026-10-05", amount: "100,00" }),
        {},
        actor,
      ),
    ).rejects.toMatchObject({ status: 422 });
    const r = await attachInvoice(
      users.financeiro,
      fin,
      m.id,
      invoiceSchema.parse({ number: "NF-2", issueDate: "2026-10-05", amount: "100,00" }),
      arquivosNf(),
      actor,
    );
    expect(r.invoice.status).toBe(InvoiceStatus.EMITIDA);
    expect(r.invoice.number).toBe("NF-2");
    expect(r.invoice.sentAt).toBeNull();
    expect(r.invoice.pdfDocumentId).not.toBe(cancelada.pdfDocumentId);
    const acao = await prisma.auditLog.findFirst({
      where: { measurementId: m.id, action: "NF_ANEXADA" },
      orderBy: { createdAt: "desc" },
    });
    expect((acao?.after as { number?: string })?.number).toBe("NF-2");
    await markInvoiced(users.financeiro, fin, m.id, actor);
    const info = await getBillingInfo(ALL, m.id);
    expect(info.status).toBe(S.FATURADO);
    // PDF assinado e o da versao 2 (assinatura por versao)
    const st = await getApprovalStatus(ALL, m.id, { evidence: true });
    expect(st.signature?.version).toBe(2);
    const doc = await prisma.document.findUniqueOrThrow({
      where: { id: st.signature!.signedDocumentId! },
    });
    expect(doc.fileName).toContain("-v2-assinado");
  });

  it("transições concorrentes: só uma vence (compare-and-set) — status, decisão do portal e assinatura", async () => {
    const m = await novaMedicao();
    const [r1, r2] = await Promise.allSettled([
      transitionMeasurement(users.admin, ALL, m.id, S.EM_ELABORACAO, actor),
      transitionMeasurement(users.admin, ALL, m.id, S.CANCELADO, actor, { reason: "x" }),
    ]);
    expect([r1.status, r2.status].filter((s) => s === "fulfilled")).toHaveLength(1);
    const st = await prisma.measurement.findUniqueOrThrow({ where: { id: m.id } });
    expect([S.EM_ELABORACAO, S.CANCELADO]).toContain(st.status);
    const logs = await prisma.auditLog.count({
      where: { measurementId: m.id, action: "STATUS_ALTERADO" },
    });
    expect(logs).toBe(1);

    const m2 = await novaMedicao();
    await transitionMeasurement(users.admin, ALL, m2.id, S.EM_ELABORACAO, actor);
    await transitionMeasurement(users.admin, ALL, m2.id, S.AGUARDANDO_ENVIO, actor);
    await sendToClient(users.admin, ALL, m2.id, {}, actor);
    const token = tokenFromEmail();
    const decisoes = await Promise.allSettled([
      decidePortal(token, "APROVAR", "", {}),
      decidePortal(token, "CORRIGIR", "não", {}),
    ]);
    expect(decisoes.filter((d) => d.status === "fulfilled")).toHaveLength(1);
    const req = await prisma.approvalRequest.findFirstOrThrow({
      where: { measurementId: m2.id },
      orderBy: { sentAt: "desc" },
    });
    const med = await prisma.measurement.findUniqueOrThrow({ where: { id: m2.id } });
    // decisao e status coerentes entre si
    expect(req.decision === "APPROVED" ? S.APROVADO : S.CORRECAO_SOLICITADA).toBe(med.status);
    if (med.status === S.APROVADO) {
      const assinaturas = await Promise.allSettled([
        signPortal(token, { signerName: "X" }, {}),
        signPortal(token, { signerName: "Y" }, {}),
      ]);
      expect(assinaturas.filter((d) => d.status === "fulfilled")).toHaveLength(1);
      expect(await prisma.signature.count({ where: { measurementId: m2.id } })).toBe(1);
    }
  });

  it("envio detecta alteração concorrente da medição (snapshot congelado = itens gravados)", async () => {
    const m = await novaMedicao();
    await transitionMeasurement(users.admin, ALL, m.id, S.EM_ELABORACAO, actor);
    await transitionMeasurement(users.admin, ALL, m.id, S.AGUARDANDO_ENVIO, actor);
    // simula outra requisicao alterando a medicao no meio do envio: updatedAt muda
    const [envio, edicao] = await Promise.allSettled([
      sendToClient(users.admin, ALL, m.id, {}, actor),
      prisma.measurement.update({ where: { id: m.id }, data: { notes: "editada no meio" } }),
    ]);
    const versoes = await prisma.measurementVersion.count({ where: { measurementId: m.id } });
    const st = await prisma.measurement.findUniqueOrThrow({ where: { id: m.id } });
    if (envio.status === "fulfilled") {
      expect(versoes).toBe(1);
      expect(st.status).toBe(S.ENVIADO_AO_CLIENTE);
    } else {
      // conflito detectado: nada foi congelado nem enviado
      expect(versoes).toBe(0);
      expect(st.status).toBe(S.AGUARDANDO_ENVIO);
    }
    expect(edicao.status).toBe("fulfilled");
  });

  it("reenvio após aprovação só para quem aprovou", async () => {
    const m = await novaMedicao();
    await transitionMeasurement(users.admin, ALL, m.id, S.EM_ELABORACAO, actor);
    await transitionMeasurement(users.admin, ALL, m.id, S.AGUARDANDO_ENVIO, actor);
    await sendToClient(users.admin, ALL, m.id, {}, actor);
    await decidePortal(tokenFromEmail(), "APROVAR", "", {});
    const outro = await prisma.clientContact.create({
      data: { clientId: a.client.id, name: "Outro", email: "outro@aaa.local", isApprover: true },
    });
    await expect(
      resendApproval(users.admin, ALL, m.id, { contactId: outro.id }, actor),
    ).rejects.toBeInstanceOf(ValidationError);
    const r = await resendApproval(users.admin, ALL, m.id, { contactId: a.approver.id }, actor);
    expect((await getPortal(tokenFromEmail())).state).toBe("AGUARDANDO_ASSINATURA");
    expect(r.sentTo.email).toBe(a.approver.email);
  });

  it("timeline: IP, id do ator e campos internos só para quem audita; cliente não vê e-mails internos", async () => {
    const m = await novaMedicao();
    await updateMeasurementHeader(
      ALL,
      m.id,
      measurementHeaderSchema.parse({
        contractId: a.contract.id,
        competence: "09/2026",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        issueDate: "2026-09-30",
        notes: "observação interna",
      }),
      { label: "Ana <ana@prestadora.local>", userId: users.admin.id, ip: "10.0.0.9" },
    );
    const full = await getMeasurementTimeline(ALL, m.id, { full: true });
    const alt = full.find((e) => e.action === "MEDICAO_ALTERADA")!;
    expect(alt.ip).toBe("10.0.0.9");
    expect((alt.after as { notes?: string }).notes).toBe("observação interna");
    const pub = await getMeasurementTimeline(ALL, m.id, { hideActorEmail: true });
    const altPub = pub.find((e) => e.action === "MEDICAO_ALTERADA")!;
    expect(altPub.ip).toBeNull();
    expect(altPub.actorUserId).toBeNull();
    expect(altPub.actorLabel).toBe("Ana");
    expect((altPub.after as { notes?: string }).notes).toBeUndefined();
    expect((altPub.after as { totalAmount?: string }).totalAmount).toBeDefined();
    asUser(users.operacional);
    const r = await callRoute(timelineGET, { path: "/x", params: { id: m.id } });
    expect(r.status).toBe(200);
    expect((r.json as Array<{ ip: string | null }>).every((e) => e.ip === null)).toBe(true);
    asUser(users.admin);
    const r2 = await callRoute(timelineGET, { path: "/x", params: { id: m.id } });
    expect((r2.json as Array<{ ip: string | null }>).some((e) => e.ip === "10.0.0.9")).toBe(true);
    asUser(null);
  });

  it("sessão reconciliada: usuário inativado deixa de resolver (cache invalidado)", async () => {
    expect((await resolveSessionUser(users.operacional.id))?.role).toBe("OPERACIONAL");
    await prisma.user.update({ where: { id: users.operacional.id }, data: { isActive: false } });
    // cache de 60 s ainda responde; apos invalidar, o banco manda
    expect(await resolveSessionUser(users.operacional.id)).not.toBeNull();
    invalidateSessionUser(users.operacional.id);
    expect(await resolveSessionUser(users.operacional.id)).toBeNull();
    await prisma.user.update({ where: { id: users.operacional.id }, data: { isActive: true } });
    invalidateSessionUser(users.operacional.id);
    expect(await resolveSessionUser("00000000-0000-7000-8000-000000000000")).toBeNull();
  });

  it("limites numéricos: mais de 4 casas ou magnitude acima do banco viram 422, nunca 500; total negativo é recusado", async () => {
    const m = await novaMedicao();
    asUser(users.admin);
    const casas = await callRoute(itensPOST, {
      method: "POST",
      path: "/x",
      params: { id: m.id, tipo: "mao-de-obra" },
      body: { code: "X", role: "X", quantity: "1,00005", unit: "h", unitPrice: "1" },
    });
    expect(casas.status).toBe(422);
    const grande = await callRoute(itensPOST, {
      method: "POST",
      path: "/x",
      params: { id: m.id, tipo: "mao-de-obra" },
      body: { code: "X", role: "X", quantity: "1000000000000", unit: "h", unitPrice: "1" },
    });
    expect(grande.status).toBe(422);
    const ok = await callRoute(itensPOST, {
      method: "POST",
      path: "/x",
      params: { id: m.id, tipo: "mao-de-obra" },
      body: { code: "X", role: "X", quantity: "1,0005", unit: "h", unitPrice: "10,005" },
    });
    expect(ok.status).toBe(201);
    asUser(null);
    await expect(
      updateMeasurementHeader(
        ALL,
        m.id,
        measurementHeaderSchema.parse({
          contractId: a.contract.id,
          competence: "09/2026",
          startDate: "2026-09-01",
          endDate: "2026-09-30",
          issueDate: "2026-09-30",
          discountAmount: "999999",
        }),
        actor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("descrição dos filtros respeita o escopo; dashboard conta links expirados no banco", async () => {
    const f = reportFiltersSchema.parse({ clientId: b.client.id });
    expect(await describeFilters(getScope(users.cliente), f)).toBe("sem filtros");
    expect(await describeFilters(ALL, f)).toContain("cliente BBB");
    const m = await novaMedicao();
    await transitionMeasurement(users.admin, ALL, m.id, S.EM_ELABORACAO, actor);
    await transitionMeasurement(users.admin, ALL, m.id, S.AGUARDANDO_ENVIO, actor);
    await sendToClient(users.admin, ALL, m.id, {}, actor);
    await prisma.approvalRequest.updateMany({
      where: { measurementId: m.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const d = await getDashboard(ALL);
    expect(d.cards.linksExpirados).toBeGreaterThanOrEqual(1);
    expect(d.pendencias.some((p) => p.id === m.id && p.tipo === "LINK_EXPIRADO")).toBe(true);
    expect(d.cards.correcaoSolicitada).toBe(
      d.porStatus.find((s) => s.status === S.CORRECAO_SOLICITADA)?.quantidade ?? 0,
    );
    expect(d.atividade.length).toBeGreaterThan(0);
    expect(d.atividade.every((x) => x.number)).toBe(true);
  });
});
