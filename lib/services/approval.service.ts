import { prisma } from "@/lib/db/prisma";
import { ApprovalDecision, MeasurementStatus as S } from "@/lib/db/generated/enums";
import type { Prisma } from "@/lib/db/generated/client";
import type { Scope } from "@/lib/auth/scope";
import type { SessionUser } from "@/lib/auth/rbac";
import { AppError, NotFoundError, TransitionError } from "@/lib/errors";
import { audit, portalActor, SYSTEM_ACTOR, type AuditActor } from "@/lib/services/audit.service";
import { assertTransition } from "@/lib/services/status-machine";
import { buildSnapshot, type MeasurementSnapshot } from "@/lib/services/snapshot";
import {
  findMeasurementBasic,
  findMeasurementById,
} from "@/lib/db/repositories/measurement.repository";
import { generateToken, hashToken } from "@/lib/services/auth.service";
import { boletimDataFromSnapshot, pdfFileName, type SignatureEvidence } from "@/lib/pdf/data";
import { renderBoletimPdf, sha256Hex } from "@/lib/pdf/render";
import { storeDocument } from "@/lib/services/document.service";
import { compareSnapshots } from "@/lib/services/version-compare";
import { getStorage } from "@/lib/storage";
import { getEmailProvider } from "@/lib/email";
import { config } from "@/lib/config";
import { formatCompetence, formatCurrency, formatDate } from "@/lib/utils/format-all";

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

// ---------------------------------------------------------------------------
// envio ao cliente
// ---------------------------------------------------------------------------

async function requireMeasurement(scope: Scope, id: string) {
  const m = await findMeasurementBasic(prisma, scope, id);
  if (!m) throw new NotFoundError("Medição não encontrada.");
  return m;
}

async function resolveApprover(clientId: string, contactId?: string) {
  const where: Prisma.ClientContactWhereInput = { clientId, isActive: true, isApprover: true };
  const contact = contactId
    ? await prisma.clientContact.findFirst({ where: { ...where, id: contactId } })
    : await prisma.clientContact.findFirst({ where, orderBy: { name: "asc" } });
  if (!contact) {
    throw new TransitionError(
      contactId
        ? "O contato informado não é um aprovador ativo deste cliente."
        : "Cadastre um contato aprovador ativo para o cliente antes de enviar.",
    );
  }
  return contact;
}

function portalUrl(token: string): string {
  return `${config.appUrl}/portal/aprovacao/${token}`;
}

async function sendApprovalEmail(input: {
  to: string;
  name: string;
  number: string;
  version: number;
  total: string;
  competence: string;
  expiresAt: Date;
  token: string;
  clientName: string;
}) {
  const link = portalUrl(input.token);
  await getEmailProvider().send({
    to: input.to,
    subject: `Boletim de Medição ${input.number} (versão ${input.version}) para aprovação`,
    text: [
      `Olá, ${input.name}.`,
      "",
      `${config.company.name} enviou o Boletim de Medição ${input.number} (versão ${input.version}) de ${input.clientName}, competência ${formatCompetence(input.competence)}, no valor de ${formatCurrency(input.total)}.`,
      "",
      "Para visualizar, aprovar ou solicitar correção, acesse o link abaixo:",
      link,
      "",
      `O link é pessoal, de uso único para a decisão e expira em ${formatDate(input.expiresAt)}.`,
      "Após aprovar, você poderá assinar eletronicamente o boletim no mesmo link.",
    ].join("\n"),
  });
  return link;
}

export interface SendResult {
  measurementId: string;
  status: S;
  version: number;
  sentTo: { name: string; email: string };
  expiresAt: Date;
  emailSent: boolean;
  /** Somente com provedor de e-mail de desenvolvimento: link para testes. */
  portalUrl?: string;
}

/** AGUARDANDO_ENVIO -> ENVIADO_AO_CLIENTE: congela a versao, gera PDF, token e e-mail. */
export async function sendToClient(
  user: SessionUser,
  scope: Scope,
  id: string,
  options: { contactId?: string },
  actor: AuditActor,
): Promise<SendResult> {
  const m = await requireMeasurement(scope, id);
  assertTransition(m.status, S.ENVIADO_AO_CLIENTE, user.role);
  const [labor, equipment] = await Promise.all([
    prisma.laborItem.count({ where: { measurementId: id } }),
    prisma.equipmentItem.count({ where: { measurementId: id } }),
  ]);
  if (labor + equipment === 0)
    throw new TransitionError(
      "Inclua ao menos um item de mão de obra ou equipamento antes de enviar.",
    );
  const contact = await resolveApprover(m.clientId, options.contactId);

  const detail = await findMeasurementById(prisma, scope, id);
  if (!detail) throw new NotFoundError("Medição não encontrada.");
  const version = m.currentVersion + 1;
  const now = new Date();
  const snapshot = buildSnapshot(
    {
      ...detail,
      client: {
        id: detail.client.id,
        legalName: detail.client.legalName,
        tradeName: detail.client.tradeName,
        cnpj: detail.client.cnpj,
      },
      contract: {
        id: detail.contract.id,
        code: detail.contract.code,
        name: detail.contract.name,
        unit: detail.contract.unit,
      },
    },
    version,
    now,
  );
  const pdf = await renderBoletimPdf(
    boletimDataFromSnapshot(snapshot, S.ENVIADO_AO_CLIENTE, { generatedAt: now }),
  );
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + config.approval.tokenTtlDays * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    // invalida solicitacoes anteriores ainda abertas (reenvio de versao anterior)
    await tx.approvalRequest.updateMany({
      where: { measurementId: id, decidedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    const doc = await storeDocument(
      tx,
      {
        measurementId: id,
        clientId: m.clientId,
        type: "BOLETIM",
        fileName: pdfFileName(m.number, version),
        mimeType: "application/pdf",
        data: pdf,
        uploadedByUserId: user.id,
      },
      actor,
    );
    const v = await tx.measurementVersion.create({
      data: {
        measurementId: id,
        version,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        pdfDocumentId: doc.id,
        createdByUserId: user.id,
        createdAt: now,
      },
    });
    await tx.approvalRequest.create({
      data: {
        measurementId: id,
        versionId: v.id,
        tokenHash: hashToken(token),
        expiresAt,
        sentToEmail: contact.email,
        sentToName: contact.name,
        sentAt: now,
      },
    });
    await tx.measurement.update({
      where: { id },
      data: { status: S.ENVIADO_AO_CLIENTE, currentVersion: version },
    });
    await audit(tx, {
      entity: "MeasurementVersion",
      entityId: v.id,
      action: "VERSAO_CRIADA",
      actor,
      after: {
        measurementId: id,
        version,
        pdfDocumentId: doc.id,
        totalAmount: snapshot.totals.totalAmount,
      },
    });
    await audit(tx, {
      entity: "Measurement",
      entityId: id,
      action: "ENVIADO_AO_CLIENTE",
      actor,
      before: { status: m.status },
      after: {
        status: S.ENVIADO_AO_CLIENTE,
        version,
        enviadoPara: `${contact.name} <${contact.email}>`,
        expiraEm: expiresAt.toISOString(),
      },
    });
  });

  let emailSent = true;
  try {
    await sendApprovalEmail({
      to: contact.email,
      name: contact.name,
      number: m.number,
      version,
      total: snapshot.totals.totalAmount,
      competence: m.competence,
      expiresAt,
      token,
      clientName: snapshot.client.legalName,
    });
  } catch (error) {
    console.error("[aprovacao] falha ao enviar e-mail:", error);
    emailSent = false;
  }
  return {
    measurementId: id,
    status: S.ENVIADO_AO_CLIENTE,
    version,
    sentTo: { name: contact.name, email: contact.email },
    expiresAt,
    emailSent,
    portalUrl: config.email.provider === "dev" ? portalUrl(token) : undefined,
  };
}

/** Gera um novo link para a versao vigente (o anterior deixa de valer). Admin. */
export async function resendApproval(
  user: SessionUser,
  scope: Scope,
  id: string,
  options: { contactId?: string },
  actor: AuditActor,
): Promise<SendResult> {
  const m = await requireMeasurement(scope, id);
  if (user.role !== "ADMIN")
    throw new AppError("Somente o administrador pode reenviar o link.", 403, "FORBIDDEN");
  const resendable: S[] = [S.ENVIADO_AO_CLIENTE, S.EM_APROVACAO, S.APROVADO];
  if (!resendable.includes(m.status)) {
    throw new TransitionError(
      "O reenvio só é possível enquanto a medição aguarda decisão ou assinatura do cliente.",
    );
  }
  const version = await prisma.measurementVersion.findFirst({
    where: { measurementId: id, version: m.currentVersion },
  });
  if (!version) throw new NotFoundError("Versão vigente não encontrada.");
  const snapshot = version.snapshot as unknown as MeasurementSnapshot;
  const previous = await prisma.approvalRequest.findFirst({
    where: { measurementId: id, versionId: version.id },
    orderBy: { sentAt: "desc" },
  });
  const contact = await resolveApprover(m.clientId, options.contactId ?? undefined);
  const now = new Date();
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + config.approval.tokenTtlDays * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.approvalRequest.updateMany({
      where: { measurementId: id, versionId: version.id, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    await tx.approvalRequest.create({
      data: {
        measurementId: id,
        versionId: version.id,
        tokenHash: hashToken(token),
        expiresAt,
        sentToEmail: contact.email,
        sentToName: contact.name,
        sentAt: now,
        // se ja aprovado, o novo link nasce aprovado (serve para assinar)
        decision:
          m.status === S.APROVADO ? (previous?.decision ?? ApprovalDecision.APPROVED) : null,
        decidedAt: m.status === S.APROVADO ? (previous?.decidedAt ?? now) : null,
        usedAt: m.status === S.APROVADO ? (previous?.usedAt ?? now) : null,
        comment: m.status === S.APROVADO ? previous?.comment : null,
      },
    });
    await audit(tx, {
      entity: "Measurement",
      entityId: id,
      action: "ENVIADO_AO_CLIENTE",
      actor,
      after: {
        status: m.status,
        version: m.currentVersion,
        reenvio: true,
        enviadoPara: `${contact.name} <${contact.email}>`,
        expiraEm: expiresAt.toISOString(),
      },
    });
  });

  let emailSent = true;
  try {
    await sendApprovalEmail({
      to: contact.email,
      name: contact.name,
      number: m.number,
      version: m.currentVersion,
      total: snapshot.totals.totalAmount,
      competence: m.competence,
      expiresAt,
      token,
      clientName: snapshot.client.legalName,
    });
  } catch (error) {
    console.error("[aprovacao] falha ao enviar e-mail:", error);
    emailSent = false;
  }
  return {
    measurementId: id,
    status: m.status,
    version: m.currentVersion,
    sentTo: { name: contact.name, email: contact.email },
    expiresAt,
    emailSent,
    portalUrl: config.email.provider === "dev" ? portalUrl(token) : undefined,
  };
}

// ---------------------------------------------------------------------------
// portal por token
// ---------------------------------------------------------------------------

export type PortalState =
  | "AGUARDANDO_DECISAO"
  | "CORRECAO_SOLICITADA"
  | "AGUARDANDO_ASSINATURA"
  | "ASSINADO"
  | "SUBSTITUIDA";

export interface PortalView {
  state: PortalState;
  request: {
    id: string;
    sentToName: string;
    sentToEmail: string;
    sentAt: Date;
    expiresAt: Date;
    openedAt: Date | null;
    decidedAt: Date | null;
    decision: ApprovalDecision | null;
    comment: string | null;
  };
  measurement: { id: string; number: string; status: S; currentVersion: number };
  version: { id: string; version: number; snapshot: MeasurementSnapshot };
  signature: {
    signerName: string;
    signerEmail: string;
    signedAt: Date;
    documentHash: string;
    signedDocumentId: string | null;
  } | null;
  company: { name: string; cnpj: string; email: string };
}

const requestInclude = {
  measurement: true,
  version: true,
  signature: true,
} satisfies Prisma.ApprovalRequestInclude;
type RequestRow = Prisma.ApprovalRequestGetPayload<{ include: typeof requestInclude }>;

/** Valida o token: existe, nao expirou. Nunca revela dados de outra medicao. */
async function findRequestByToken(token: string): Promise<RequestRow> {
  const req = await prisma.approvalRequest.findUnique({
    where: { tokenHash: hashToken(token) },
    include: requestInclude,
  });
  if (!req || req.measurement.deletedAt) throw new NotFoundError("Link inválido.");
  if (req.expiresAt <= new Date())
    throw new AppError(
      "Este link expirou. Solicite um novo envio à prestadora.",
      410,
      "TOKEN_EXPIRED",
    );
  return req;
}

const SUPERSEDED: S[] = [S.CANCELADO, S.EM_ELABORACAO, S.AGUARDANDO_ENVIO, S.RASCUNHO];
const SIGNED: S[] = [S.ASSINADO, S.LIBERADO_FATURAMENTO, S.NF_ANEXADA, S.FATURADO];

function stateOf(req: RequestRow): PortalState {
  const m = req.measurement;
  if (req.version.version !== m.currentVersion || SUPERSEDED.includes(m.status))
    return "SUBSTITUIDA";
  if (req.signature || SIGNED.includes(m.status)) return "ASSINADO";
  if (req.decision === ApprovalDecision.CHANGES_REQUESTED || m.status === S.CORRECAO_SOLICITADA)
    return "CORRECAO_SOLICITADA";
  if (req.decision === ApprovalDecision.APPROVED || m.status === S.APROVADO)
    return "AGUARDANDO_ASSINATURA";
  return "AGUARDANDO_DECISAO";
}

async function toView(req: RequestRow): Promise<PortalView> {
  const signature =
    req.signature ??
    (await prisma.signature.findFirst({
      where: { measurementId: req.measurementId, versionId: req.versionId },
      orderBy: { signedAt: "desc" },
    }));
  let signedDocumentId: string | null = null;
  if (signature) {
    const doc = await prisma.document.findFirst({
      where: { measurementId: req.measurementId, type: "BOLETIM_ASSINADO", deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    signedDocumentId = doc?.id ?? null;
  }
  return {
    state: stateOf(req),
    request: {
      id: req.id,
      sentToName: req.sentToName,
      sentToEmail: req.sentToEmail,
      sentAt: req.sentAt,
      expiresAt: req.expiresAt,
      openedAt: req.openedAt,
      decidedAt: req.decidedAt,
      decision: req.decision,
      comment: req.comment,
    },
    measurement: {
      id: req.measurement.id,
      number: req.measurement.number,
      status: req.measurement.status,
      currentVersion: req.measurement.currentVersion,
    },
    version: {
      id: req.version.id,
      version: req.version.version,
      snapshot: req.version.snapshot as unknown as MeasurementSnapshot,
    },
    signature: signature
      ? {
          signerName: signature.signerName,
          signerEmail: signature.signerEmail,
          signedAt: signature.signedAt,
          documentHash: signature.documentHash,
          signedDocumentId,
        }
      : null,
    company: config.company,
  };
}

/** Abre o portal: registra a primeira abertura e ENVIADO_AO_CLIENTE -> EM_APROVACAO (Sistema). */
export async function openPortal(token: string, meta: RequestMeta = {}): Promise<PortalView> {
  const req = await findRequestByToken(token);
  if (!req.openedAt || req.measurement.status === S.ENVIADO_AO_CLIENTE) {
    await prisma.$transaction(async (tx) => {
      if (!req.openedAt)
        await tx.approvalRequest.update({ where: { id: req.id }, data: { openedAt: new Date() } });
      if (
        req.measurement.status === S.ENVIADO_AO_CLIENTE &&
        req.version.version === req.measurement.currentVersion
      ) {
        assertTransition(S.ENVIADO_AO_CLIENTE, S.EM_APROVACAO, "SISTEMA");
        await tx.measurement.update({
          where: { id: req.measurementId },
          data: { status: S.EM_APROVACAO },
        });
        await audit(tx, {
          entity: "Measurement",
          entityId: req.measurementId,
          action: "ABERTO_PELO_CLIENTE",
          actor: { ...SYSTEM_ACTOR, ip: meta.ip, userAgent: meta.userAgent },
          before: { status: S.ENVIADO_AO_CLIENTE },
          after: { status: S.EM_APROVACAO, abertoPor: req.sentToEmail },
        });
      }
    });
    return toView((await findRequestByToken(token)) as RequestRow);
  }
  return toView(req);
}

export async function getPortal(token: string): Promise<PortalView> {
  return toView(await findRequestByToken(token));
}

/** Aprova ou solicita correcao. Uso unico: um segundo uso e rejeitado. */
export async function decidePortal(
  token: string,
  decision: "APROVAR" | "CORRIGIR",
  comment: string,
  meta: RequestMeta = {},
): Promise<PortalView> {
  const req = await findRequestByToken(token);
  if (req.usedAt || req.decision)
    throw new AppError("Este link já foi utilizado para registrar a decisão.", 409, "TOKEN_USED");
  const state = stateOf(req);
  if (state !== "AGUARDANDO_DECISAO")
    throw new AppError("Esta medição não está mais aguardando decisão.", 409, "INVALID_STATE");
  const to = decision === "APROVAR" ? S.APROVADO : S.CORRECAO_SOLICITADA;
  assertTransition(req.measurement.status, to, "CLIENTE");
  const now = new Date();
  const actor = portalActor(req.sentToEmail, req.sentToName, meta);
  await prisma.$transaction(async (tx) => {
    await tx.approvalRequest.update({
      where: { id: req.id },
      data: {
        decision:
          decision === "APROVAR" ? ApprovalDecision.APPROVED : ApprovalDecision.CHANGES_REQUESTED,
        decidedAt: now,
        usedAt: now,
        comment: comment || null,
        openedAt: req.openedAt ?? now,
      },
    });
    await tx.measurement.update({ where: { id: req.measurementId }, data: { status: to } });
    await audit(tx, {
      entity: "Measurement",
      entityId: req.measurementId,
      action: decision === "APROVAR" ? "APROVADO" : "CORRECAO_SOLICITADA",
      actor,
      before: { status: req.measurement.status },
      after: { status: to, version: req.version.version, ...(comment ? { motivo: comment } : {}) },
    });
  });
  return toView((await findRequestByToken(token)) as RequestRow);
}

/** Assina eletronicamente a versao aprovada: evidencias + PDF final com o bloco de evidencias. */
export async function signPortal(
  token: string,
  input: { signerName: string },
  meta: RequestMeta = {},
): Promise<PortalView> {
  const req = await findRequestByToken(token);
  if (stateOf(req) !== "AGUARDANDO_ASSINATURA")
    throw new AppError("Esta medição não está aguardando assinatura.", 409, "INVALID_STATE");
  assertTransition(req.measurement.status, S.ASSINADO, "CLIENTE");
  const snapshot = req.version.snapshot as unknown as MeasurementSnapshot;

  // hash do documento que o cliente visualizou e aprovou (PDF da versao)
  const versionPdf = await getVersionPdfBuffer(
    req.version.pdfDocumentId,
    snapshot,
    req.measurement.status,
  );
  const documentHash = sha256Hex(versionPdf);
  const signedAt = new Date();
  const evidence: SignatureEvidence = {
    signerName: input.signerName,
    signerEmail: req.sentToEmail,
    signedAt,
    ipAddress: meta.ip ?? "desconhecido",
    userAgent: meta.userAgent ?? "desconhecido",
    documentHash,
    version: req.version.version,
  };
  const signedPdf = await renderBoletimPdf(
    boletimDataFromSnapshot(snapshot, S.ASSINADO, { signature: evidence, generatedAt: signedAt }),
  );
  const actor = portalActor(req.sentToEmail, input.signerName, meta);

  await prisma.$transaction(async (tx) => {
    const sig = await tx.signature.create({
      data: {
        measurementId: req.measurementId,
        versionId: req.versionId,
        approvalRequestId: req.id,
        signerName: input.signerName,
        signerEmail: req.sentToEmail,
        signedAt,
        ipAddress: evidence.ipAddress,
        userAgent: evidence.userAgent,
        documentHash,
      },
    });
    const doc = await storeDocument(
      tx,
      {
        measurementId: req.measurementId,
        clientId: req.measurement.clientId,
        type: "BOLETIM_ASSINADO",
        fileName: `${req.measurement.number}-v${req.version.version}-assinado.pdf`,
        mimeType: "application/pdf",
        data: signedPdf,
      },
      actor,
    );
    await tx.measurement.update({ where: { id: req.measurementId }, data: { status: S.ASSINADO } });
    await audit(tx, {
      entity: "Signature",
      entityId: sig.id,
      action: "ASSINADO",
      actor,
      after: {
        measurementId: req.measurementId,
        version: req.version.version,
        signerName: input.signerName,
        signerEmail: req.sentToEmail,
        ip: evidence.ipAddress,
        documentHash,
        signedDocumentId: doc.id,
      },
    });
    await audit(tx, {
      entity: "Measurement",
      entityId: req.measurementId,
      action: "STATUS_ALTERADO",
      actor,
      before: { status: req.measurement.status },
      after: { status: S.ASSINADO, version: req.version.version },
    });
  });
  return toView((await findRequestByToken(token)) as RequestRow);
}

async function getVersionPdfBuffer(
  pdfDocumentId: string | null,
  snapshot: MeasurementSnapshot,
  status: S,
): Promise<Buffer> {
  if (pdfDocumentId) {
    const doc = await prisma.document.findUnique({ where: { id: pdfDocumentId } });
    if (doc) {
      try {
        return await getStorage().get(doc.storageKey);
      } catch {
        // arquivo ausente no storage local (ex.: seed): regenera a partir do snapshot
      }
    }
  }
  return renderBoletimPdf(
    boletimDataFromSnapshot(snapshot, status, { generatedAt: new Date(snapshot.createdAt) }),
  );
}

/** PDF exibido no portal: o assinado (se houver) ou o da versao. */
export async function getPortalPdf(token: string): Promise<{ data: Buffer; fileName: string }> {
  const req = await findRequestByToken(token);
  const snapshot = req.version.snapshot as unknown as MeasurementSnapshot;
  const signed = await prisma.document.findFirst({
    where: { measurementId: req.measurementId, type: "BOLETIM_ASSINADO", deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (signed && stateOf(req) === "ASSINADO") {
    return { data: await getStorage().get(signed.storageKey), fileName: signed.fileName };
  }
  return {
    data: await getVersionPdfBuffer(req.version.pdfDocumentId, snapshot, req.measurement.status),
    fileName: pdfFileName(req.measurement.number, req.version.version),
  };
}

// ---------------------------------------------------------------------------
// versoes (area interna)
// ---------------------------------------------------------------------------

export async function listVersions(scope: Scope, id: string) {
  await requireMeasurement(scope, id);
  const versions = await prisma.measurementVersion.findMany({
    where: { measurementId: id },
    orderBy: { version: "desc" },
    include: {
      createdBy: { select: { name: true } },
      approvalRequests: {
        orderBy: { sentAt: "desc" },
        select: {
          id: true,
          sentToName: true,
          sentToEmail: true,
          sentAt: true,
          expiresAt: true,
          openedAt: true,
          decidedAt: true,
          decision: true,
          comment: true,
        },
      },
      signatures: {
        select: {
          id: true,
          signerName: true,
          signerEmail: true,
          signedAt: true,
          ipAddress: true,
          documentHash: true,
        },
      },
    },
  });
  return versions.map((v) => {
    const snapshot = v.snapshot as unknown as MeasurementSnapshot;
    return {
      id: v.id,
      version: v.version,
      createdAt: v.createdAt,
      createdBy: v.createdBy.name,
      reason: v.reason,
      pdfDocumentId: v.pdfDocumentId,
      totalAmount: snapshot.totals.totalAmount,
      laborCount: snapshot.laborItems.length,
      equipmentCount: snapshot.equipmentItems.length,
      requests: v.approvalRequests,
      signatures: v.signatures,
    };
  });
}

export async function getVersionPdf(
  scope: Scope,
  id: string,
  version: number,
): Promise<{ data: Buffer; fileName: string }> {
  const m = await requireMeasurement(scope, id);
  const v = await prisma.measurementVersion.findFirst({ where: { measurementId: id, version } });
  if (!v) throw new NotFoundError("Versão não encontrada.");
  const snapshot = v.snapshot as unknown as MeasurementSnapshot;
  const status = version === m.currentVersion ? m.status : S.ENVIADO_AO_CLIENTE;
  return {
    data: await getVersionPdfBuffer(v.pdfDocumentId, snapshot, status),
    fileName: pdfFileName(m.number, version),
  };
}

export async function compareVersions(scope: Scope, id: string, a: number, b: number) {
  await requireMeasurement(scope, id);
  const [va, vb] = await Promise.all([
    prisma.measurementVersion.findFirst({ where: { measurementId: id, version: a } }),
    prisma.measurementVersion.findFirst({ where: { measurementId: id, version: b } }),
  ]);
  if (!va || !vb) throw new NotFoundError("Versão não encontrada.");
  return compareSnapshots(
    va.snapshot as unknown as MeasurementSnapshot,
    vb.snapshot as unknown as MeasurementSnapshot,
  );
}

/** Informacoes da solicitacao vigente para a tela da medicao. */
export async function getApprovalStatus(scope: Scope, id: string) {
  const m = await requireMeasurement(scope, id);
  const request = await prisma.approvalRequest.findFirst({
    where: { measurementId: id },
    orderBy: { sentAt: "desc" },
    include: { version: { select: { version: true } } },
  });
  const signature = await prisma.signature.findFirst({
    where: { measurementId: id },
    orderBy: { signedAt: "desc" },
    include: { version: { select: { version: true } } },
  });
  const signedDoc = signature
    ? await prisma.document.findFirst({
        where: { measurementId: id, type: "BOLETIM_ASSINADO", deletedAt: null },
        orderBy: { createdAt: "desc" },
      })
    : null;
  return {
    currentVersion: m.currentVersion,
    request: request
      ? {
          sentToName: request.sentToName,
          sentToEmail: request.sentToEmail,
          sentAt: request.sentAt,
          expiresAt: request.expiresAt,
          openedAt: request.openedAt,
          decidedAt: request.decidedAt,
          decision: request.decision,
          comment: request.comment,
          version: request.version.version,
          expired: request.expiresAt <= new Date(),
        }
      : null,
    signature: signature
      ? {
          signerName: signature.signerName,
          signerEmail: signature.signerEmail,
          signedAt: signature.signedAt,
          ipAddress: signature.ipAddress,
          documentHash: signature.documentHash,
          version: signature.version.version,
          signedDocumentId: signedDoc?.id ?? null,
        }
      : null,
  };
}
