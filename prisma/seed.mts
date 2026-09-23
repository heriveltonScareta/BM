/**
 * Seed de desenvolvimento (Secao 17): dados realistas de mineracao e construcao pesada.
 * Executar: npm run db:seed. Recusa rodar em banco ja populado, salvo SEED_RESET=1.
 */
import { createHash, randomBytes } from "node:crypto";
import Decimal from "decimal.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/db/generated/client";
import {
  MeasurementStatus,
  Role,
  InvoiceStatus,
  ApprovalDecision,
} from "../lib/db/generated/enums";
import { hashPassword } from "../lib/auth/password";
import { computeItemTotal, computeTotals, totalsToStrings } from "../lib/services/calculation";
import { buildSnapshot } from "../lib/services/snapshot";
import { formatMeasurementNumber } from "../lib/services/measurement-number";
import type { AuditAction } from "../lib/services/audit.service";

try {
  process.loadEnvFile(".env");
} catch {
  // sem .env
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

const S = MeasurementStatus;
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "Demo@2026";

// ---------------------------------------------------------------------------
// utilitarios
// ---------------------------------------------------------------------------

function cnpjFromBase(base12: string): string {
  const calc = (base: string, weights: number[]) => {
    const sum = base.split("").reduce((acc, ch, i) => acc + Number(ch) * (weights[i] ?? 0), 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = calc(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base12}${d1}${d2}`;
}

function utcDate(y: number, m: number, d: number, h = 12): Date {
  return new Date(Date.UTC(y, m - 1, d, h));
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

// ---------------------------------------------------------------------------
// catalogo
// ---------------------------------------------------------------------------

const LABOR = [
  { code: "MO-001", role: "Encarregado de perfuração", unit: "h", price: "62.50" },
  { code: "MO-002", role: "Operador de perfuratriz", unit: "h", price: "48.90" },
  { code: "MO-003", role: "Blaster", unit: "h", price: "55.00" },
  { code: "MO-004", role: "Ajudante de blaster", unit: "h", price: "28.75" },
  { code: "MO-005", role: "Operador de escavadeira", unit: "h", price: "46.30" },
  { code: "MO-006", role: "Motorista de caminhão", unit: "h", price: "34.20" },
  { code: "MO-007", role: "Mecânico de manutenção", unit: "h", price: "52.40" },
  { code: "MO-008", role: "Técnico de segurança do trabalho", unit: "dia", price: "410.00" },
  { code: "MO-009", role: "Soldador", unit: "h", price: "49.80" },
  { code: "MO-010", role: "Eletricista industrial", unit: "h", price: "51.15" },
  { code: "MO-011", role: "Topógrafo", unit: "dia", price: "520.00" },
  { code: "MO-012", role: "Auxiliar de serviços gerais", unit: "h", price: "24.60" },
] as const;

const EQUIPMENT = [
  { code: "EQ-001", name: "Perfuratriz hidráulica", unit: "h", price: "385.00" },
  { code: "EQ-002", name: "Caminhão pipa 15.000 L", unit: "h", price: "142.50" },
  { code: "EQ-003", name: "Retroescavadeira", unit: "h", price: "118.90" },
  { code: "EQ-004", name: "Escavadeira hidráulica 30 t", unit: "h", price: "265.00" },
  { code: "EQ-005", name: "Caminhão basculante 6x4", unit: "h", price: "156.40" },
  { code: "EQ-006", name: "Compressor de ar 750 pcm", unit: "dia", price: "890.00" },
  { code: "EQ-007", name: "Gerador 100 kVA", unit: "dia", price: "640.00" },
  { code: "EQ-008", name: "Motoniveladora", unit: "h", price: "232.70" },
  { code: "EQ-009", name: "Rolo compactador", unit: "h", price: "148.30" },
  { code: "EQ-010", name: "Pá carregadeira", unit: "h", price: "198.60" },
] as const;

// ---------------------------------------------------------------------------
// plano das 12 medicoes (uma por status, 4 competencias)
// ---------------------------------------------------------------------------

interface Plan {
  status: MeasurementStatus;
  client: number;
  contract: number;
  competence: [number, number];
  labor: number[];
  equipment: number[];
  frs?: string;
  pc?: string;
  discount?: string;
  addition?: string;
  tax?: string;
  other?: string;
  notes?: string;
  /** indice do usuario dono: 0 admin, 1 operacional */
  owner: 0 | 1;
}

const PLANS: Plan[] = [
  {
    status: S.FATURADO,
    client: 0,
    contract: 0,
    competence: [2026, 6],
    labor: [0, 1, 2, 3, 7],
    equipment: [0, 1, 5],
    frs: "FRS-2026-0611",
    pc: "PC-45001",
    tax: "1850.00",
    owner: 0,
  },
  {
    status: S.NF_ANEXADA,
    client: 1,
    contract: 1,
    competence: [2026, 6],
    labor: [4, 5, 11, 7],
    equipment: [3, 4, 7, 8],
    frs: "FRS-2026-0618",
    pc: "PC-77210",
    discount: "1200.00",
    owner: 1,
  },
  {
    status: S.LIBERADO_FATURAMENTO,
    client: 2,
    contract: 2,
    competence: [2026, 7],
    labor: [6, 8, 9, 7],
    equipment: [6, 2],
    frs: "FRS-2026-0702",
    pc: "PC-90315",
    owner: 0,
  },
  {
    status: S.ASSINADO,
    client: 0,
    contract: 0,
    competence: [2026, 7],
    labor: [0, 1, 2, 3, 10, 7],
    equipment: [0, 1, 5, 9],
    frs: "FRS-2026-0715",
    pc: "PC-45002",
    addition: "2400.00",
    tax: "1975.50",
    owner: 1,
  },
  {
    status: S.APROVADO,
    client: 1,
    contract: 1,
    competence: [2026, 8],
    labor: [4, 5, 11],
    equipment: [3, 4, 7, 9],
    frs: "FRS-2026-0803",
    pc: "PC-77244",
    owner: 1,
  },
  {
    status: S.CORRECAO_SOLICITADA,
    client: 2,
    contract: 2,
    competence: [2026, 8],
    labor: [6, 8, 9],
    equipment: [6],
    frs: "FRS-2026-0809",
    pc: "PC-90402",
    owner: 0,
  },
  {
    status: S.EM_APROVACAO,
    client: 0,
    contract: 0,
    competence: [2026, 8],
    labor: [0, 1, 2, 3, 7],
    equipment: [0, 1, 5],
    frs: "FRS-2026-0821",
    pc: "PC-45003",
    owner: 0,
  },
  {
    status: S.ENVIADO_AO_CLIENTE,
    client: 1,
    contract: 1,
    competence: [2026, 9],
    labor: [4, 5, 11, 7],
    equipment: [3, 4, 8],
    frs: "FRS-2026-0904",
    pc: "PC-77301",
    owner: 1,
  },
  {
    status: S.AGUARDANDO_ENVIO,
    client: 2,
    contract: 2,
    competence: [2026, 9],
    labor: [6, 8, 9, 7],
    equipment: [6, 2, 7],
    frs: "FRS-2026-0910",
    owner: 1,
  },
  {
    status: S.EM_ELABORACAO,
    client: 0,
    contract: 0,
    competence: [2026, 9],
    labor: [0, 1, 2, 3],
    equipment: [0, 1],
    owner: 1,
    notes: "Aguardando fechamento das horas da última semana.",
  },
  {
    status: S.RASCUNHO,
    client: 1,
    contract: 1,
    competence: [2026, 9],
    labor: [4, 5],
    equipment: [3],
    owner: 0,
  },
  {
    status: S.CANCELADO,
    client: 2,
    contract: 2,
    competence: [2026, 7],
    labor: [6, 8],
    equipment: [6],
    frs: "FRS-2026-0721",
    owner: 0,
    notes: "Cancelada: serviço reprogramado para agosto a pedido do cliente.",
  },
];

/** Caminho de status percorrido ate chegar ao status final (para versoes e auditoria). */
function pathFor(status: MeasurementStatus): MeasurementStatus[] {
  const toSent = [S.EM_ELABORACAO, S.AGUARDANDO_ENVIO, S.ENVIADO_AO_CLIENTE];
  switch (status) {
    case S.RASCUNHO:
      return [];
    case S.EM_ELABORACAO:
      return [S.EM_ELABORACAO];
    case S.AGUARDANDO_ENVIO:
      return [S.EM_ELABORACAO, S.AGUARDANDO_ENVIO];
    case S.ENVIADO_AO_CLIENTE:
      return toSent;
    case S.EM_APROVACAO:
      return [...toSent, S.EM_APROVACAO];
    case S.APROVADO:
      return [...toSent, S.EM_APROVACAO, S.APROVADO];
    case S.CORRECAO_SOLICITADA:
      return [...toSent, S.EM_APROVACAO, S.CORRECAO_SOLICITADA];
    case S.ASSINADO:
      return [
        ...toSent,
        S.EM_APROVACAO,
        S.CORRECAO_SOLICITADA,
        ...toSent,
        S.EM_APROVACAO,
        S.APROVADO,
        S.ASSINADO,
      ];
    case S.LIBERADO_FATURAMENTO:
      return [...toSent, S.EM_APROVACAO, S.APROVADO, S.ASSINADO, S.LIBERADO_FATURAMENTO];
    case S.NF_ANEXADA:
      return [
        ...toSent,
        S.EM_APROVACAO,
        S.APROVADO,
        S.ASSINADO,
        S.LIBERADO_FATURAMENTO,
        S.NF_ANEXADA,
      ];
    case S.FATURADO:
      return [
        ...toSent,
        S.EM_APROVACAO,
        S.APROVADO,
        S.ASSINADO,
        S.LIBERADO_FATURAMENTO,
        S.NF_ANEXADA,
        S.FATURADO,
      ];
    case S.CANCELADO:
      return [S.EM_ELABORACAO, S.CANCELADO];
  }
}

// ---------------------------------------------------------------------------
// execucao
// ---------------------------------------------------------------------------

async function resetDatabase() {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.signature.deleteMany(),
    prisma.approvalRequest.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.measurementVersion.deleteMany(),
    prisma.document.deleteMany(),
    prisma.laborItem.deleteMany(),
    prisma.equipmentItem.deleteMany(),
    prisma.measurement.deleteMany(),
    prisma.measurementCounter.deleteMany(),
    prisma.contract.deleteMany(),
    prisma.clientContact.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.user.deleteMany(),
    prisma.client.deleteMany(),
  ]);
}

async function main() {
  const existing = await prisma.user.count();
  if (existing > 0) {
    if (process.env.SEED_RESET === "1") {
      console.log("SEED_RESET=1: limpando o banco antes de popular...");
      await resetDatabase();
    } else {
      console.log("Banco já populado. Use SEED_RESET=1 npm run db:seed para recriar os dados.");
      return;
    }
  }

  const passwordHash = await hashPassword(SEED_PASSWORD);

  // --- clientes, contatos e contratos ---
  const clientsData = [
    {
      code: "MSA",
      legalName: "Mineração Serra Azul S.A.",
      tradeName: "Serra Azul Mineração",
      cnpj: cnpjFromBase("124578360001"),
      email: "suprimentos@serraazul.com.br",
      phone: "(31) 3555-0100",
      address: "Rodovia MG-030, km 42 — Itabirito/MG",
      contacts: [
        {
          name: "Carla Menezes",
          role: "Gerente de Contratos",
          email: "carla.menezes@serraazul.com.br",
          isApprover: true,
        },
        {
          name: "Roberto Lima",
          role: "Supervisor de Mina",
          email: "roberto.lima@serraazul.com.br",
          isApprover: false,
        },
      ],
      contracts: [
        {
          code: "CT-2025-014",
          name: "Perfuração e desmonte de rocha",
          unit: "Mina Serra Azul — Cava Norte",
          startDate: utcDate(2025, 3, 1),
        },
      ],
    },
    {
      code: "CVF",
      legalName: "Construtora Vale Forte Ltda.",
      tradeName: "Vale Forte",
      cnpj: cnpjFromBase("083456120001"),
      email: "engenharia@valeforte.eng.br",
      phone: "(34) 3222-4410",
      address: "Av. dos Engenheiros, 1200 — Uberlândia/MG",
      contacts: [
        {
          name: "Marcos Tavares",
          role: "Engenheiro Residente",
          email: "marcos.tavares@valeforte.eng.br",
          isApprover: true,
        },
        {
          name: "Juliana Prado",
          role: "Assistente Administrativa",
          email: "juliana.prado@valeforte.eng.br",
          isApprover: false,
        },
      ],
      contracts: [
        {
          code: "CT-2025-022",
          name: "Terraplenagem e movimentação de solo",
          unit: "Obra BR-365 — Lote 3",
          startDate: utcDate(2025, 8, 15),
        },
      ],
    },
    {
      code: "SNI",
      legalName: "Siderúrgica Norte Industrial S.A.",
      tradeName: "Norte Industrial",
      cnpj: cnpjFromBase("456123780001"),
      email: "manutencao@norteindustrial.ind.br",
      phone: "(91) 3344-7800",
      address: "Distrito Industrial, Quadra 7 — Marabá/PA",
      contacts: [
        {
          name: "Fernanda Souza",
          role: "Coordenadora de Manutenção",
          email: "fernanda.souza@norteindustrial.ind.br",
          isApprover: true,
        },
      ],
      contracts: [
        {
          code: "CT-2026-003",
          name: "Manutenção industrial mecânica e elétrica",
          unit: "Planta Marabá — Aciaria",
          startDate: utcDate(2026, 1, 10),
        },
      ],
    },
  ];

  const clients: Array<{
    id: string;
    legalName: string;
    tradeName: string;
    cnpj: string;
    contractIds: string[];
    approver: { name: string; email: string };
  }> = [];
  for (const c of clientsData) {
    const client = await prisma.client.create({
      data: {
        code: c.code,
        legalName: c.legalName,
        tradeName: c.tradeName,
        cnpj: c.cnpj,
        email: c.email,
        phone: c.phone,
        address: c.address,
        contacts: { create: c.contacts },
        contracts: { create: c.contracts },
      },
      include: { contracts: true },
    });
    const approver = c.contacts.find((x) => x.isApprover)!;
    clients.push({
      id: client.id,
      legalName: client.legalName,
      tradeName: client.tradeName,
      cnpj: client.cnpj,
      contractIds: client.contracts.map((x) => x.id),
      approver: { name: approver.name, email: approver.email },
    });
  }

  // --- usuarios ---
  const admin = await prisma.user.create({
    data: { name: "Ana Administradora", email: "admin@demo.local", passwordHash, role: Role.ADMIN },
  });
  const operacional = await prisma.user.create({
    data: {
      name: "Otávio Operacional",
      email: "operacional@demo.local",
      passwordHash,
      role: Role.OPERACIONAL,
    },
  });
  const financeiro = await prisma.user.create({
    data: {
      name: "Fábio Financeiro",
      email: "financeiro@demo.local",
      passwordHash,
      role: Role.FINANCEIRO,
    },
  });
  const cliente = await prisma.user.create({
    data: {
      name: "Carla Menezes",
      email: "cliente@demo.local",
      passwordHash,
      role: Role.CLIENTE,
      clientId: clients[0]!.id,
    },
  });
  const owners = [admin, operacional] as const;

  for (const u of [admin, operacional, financeiro, cliente]) {
    await prisma.auditLog.create({
      data: {
        entity: "User",
        entityId: u.id,
        action: "USUARIO_CRIADO" satisfies AuditAction,
        actorLabel: "Seed",
        after: { email: u.email, role: u.role },
      },
    });
  }

  // --- medicoes ---
  let sequence = 0;
  let invoiceSeq = 1180;
  for (const plan of PLANS) {
    sequence += 1;
    const [year, month] = plan.competence;
    const client = clients[plan.client]!;
    const contractId = client.contractIds[plan.contract] ?? client.contractIds[0]!;
    const owner = owners[plan.owner];
    const lastDay = lastDayOfMonth(year, month);
    const startDate = utcDate(year, month, 1);
    const endDate = utcDate(year, month, lastDay);
    const issueDate = utcDate(year, month, lastDay);
    const createdAt = utcDate(year, month, Math.min(3, lastDay), 9);
    const number = formatMeasurementNumber(year, sequence);
    const competence = `${year}-${String(month).padStart(2, "0")}`;

    const laborItems = plan.labor.map((idx, i) => {
      const cat = LABOR[idx]!;
      const quantity =
        cat.unit === "dia"
          ? new Decimal(20 + ((sequence + i) % 3))
          : new Decimal(176 + ((sequence * 7 + i * 13) % 40)).plus(i % 2 ? "0.5" : "0");
      const daysHours = cat.unit === "dia" ? quantity : new Decimal(22);
      return {
        code: cat.code,
        role: cat.role,
        description: null as string | null,
        quantity,
        unit: cat.unit,
        daysHours,
        unitPrice: new Decimal(cat.price),
        totalPrice: computeItemTotal(quantity, cat.price),
        sortOrder: i,
      };
    });
    const equipmentItems = plan.equipment.map((idx, i) => {
      const cat = EQUIPMENT[idx]!;
      const quantity =
        cat.unit === "dia"
          ? new Decimal(18 + ((sequence + i) % 4))
          : new Decimal(150 + ((sequence * 5 + i * 11) % 60)).plus(i % 3 === 0 ? "0.25" : "0");
      const daysHours = cat.unit === "dia" ? quantity : new Decimal(22);
      return {
        code: cat.code,
        name: cat.name,
        description: null as string | null,
        quantity,
        unit: cat.unit,
        daysHours,
        unitPrice: new Decimal(cat.price),
        totalPrice: computeItemTotal(quantity, cat.price),
        sortOrder: i,
      };
    });
    const totals = totalsToStrings(
      computeTotals({
        laborItems,
        equipmentItems,
        otherAmount: plan.other ?? "0",
        discountAmount: plan.discount ?? "0",
        additionAmount: plan.addition ?? "0",
        taxAmount: plan.tax ?? "0",
      }),
    );

    const path = pathFor(plan.status);
    const versionsCount = path.filter((s) => s === S.ENVIADO_AO_CLIENTE).length;

    const measurement = await prisma.measurement.create({
      data: {
        number,
        clientId: client.id,
        contractId,
        competence,
        startDate,
        endDate,
        issueDate,
        ownerUserId: owner.id,
        frs: plan.frs ?? null,
        purchaseOrder: plan.pc ?? null,
        status: plan.status,
        currentVersion: versionsCount,
        otherAmount: totals.otherAmount,
        discountAmount: totals.discountAmount,
        additionAmount: totals.additionAmount,
        taxAmount: totals.taxAmount,
        laborTotal: totals.laborTotal,
        equipmentTotal: totals.equipmentTotal,
        subtotal: totals.subtotal,
        totalAmount: totals.totalAmount,
        notes: plan.notes ?? null,
        createdAt,
        updatedAt: createdAt,
        canceledAt: plan.status === S.CANCELADO ? utcDate(year, month, 10) : null,
        laborItems: { create: laborItems },
        equipmentItems: { create: equipmentItems },
      },
      include: { laborItems: true, equipmentItems: true, contract: true },
    });
    await prisma.measurementCounter.upsert({
      where: { year },
      create: { year, lastNumber: sequence },
      update: { lastNumber: sequence },
    });

    const actorLabel = `${owner.name} <${owner.email}>`;
    await prisma.auditLog.create({
      data: {
        entity: "Measurement",
        entityId: measurement.id,
        action: "MEDICAO_CRIADA" satisfies AuditAction,
        actorUserId: owner.id,
        actorLabel,
        after: { number, status: S.RASCUNHO },
        createdAt,
      },
    });

    // percorre o caminho de status, criando versoes/aprovacoes/assinaturas
    let previous: MeasurementStatus = S.RASCUNHO;
    let version = 0;
    let versionId: string | null = null;
    let requestId: string | null = null;
    let step = 0;
    let signatureId: string | null = null;
    for (const next of path) {
      step += 1;
      const at = new Date(createdAt.getTime() + step * 36 * 60 * 60 * 1000);
      let actorUserId: string | null = owner.id;
      let label = actorLabel;
      let action: AuditAction = "STATUS_ALTERADO";

      if (next === S.ENVIADO_AO_CLIENTE) {
        version += 1;
        const snapshot = buildSnapshot(
          {
            ...measurement,
            client: {
              id: client.id,
              legalName: client.legalName,
              tradeName: client.tradeName,
              cnpj: client.cnpj,
            },
            contract: {
              id: measurement.contract.id,
              code: measurement.contract.code,
              name: measurement.contract.name,
              unit: measurement.contract.unit,
            },
          },
          version,
          at,
        );
        const v = await prisma.measurementVersion.create({
          data: {
            measurementId: measurement.id,
            version,
            snapshot: JSON.parse(JSON.stringify(snapshot)),
            createdByUserId: admin.id,
            createdAt: at,
            reason: version > 1 ? "Correção solicitada pelo cliente" : null,
          },
        });
        versionId = v.id;
        await prisma.auditLog.create({
          data: {
            entity: "MeasurementVersion",
            entityId: v.id,
            action: "VERSAO_CRIADA" satisfies AuditAction,
            actorUserId: admin.id,
            actorLabel: `${admin.name} <${admin.email}>`,
            after: { version },
            createdAt: at,
          },
        });
        const req = await prisma.approvalRequest.create({
          data: {
            measurementId: measurement.id,
            versionId: v.id,
            tokenHash: sha256(randomBytes(32).toString("base64url")),
            expiresAt: new Date(at.getTime() + 7 * 24 * 60 * 60 * 1000),
            sentToEmail: client.approver.email,
            sentToName: client.approver.name,
            sentAt: at,
            createdAt: at,
          },
        });
        requestId = req.id;
        actorUserId = admin.id;
        label = `${admin.name} <${admin.email}>`;
        action = "ENVIADO_AO_CLIENTE";
      } else if (next === S.EM_APROVACAO) {
        await prisma.approvalRequest.update({ where: { id: requestId! }, data: { openedAt: at } });
        actorUserId = null;
        label = "Sistema";
        action = "ABERTO_PELO_CLIENTE";
      } else if (next === S.APROVADO || next === S.CORRECAO_SOLICITADA) {
        const approved = next === S.APROVADO;
        await prisma.approvalRequest.update({
          where: { id: requestId! },
          data: {
            decidedAt: at,
            usedAt: at,
            decision: approved ? ApprovalDecision.APPROVED : ApprovalDecision.CHANGES_REQUESTED,
            comment: approved
              ? "De acordo com as horas apuradas."
              : "Favor revisar as horas do caminhão pipa: registro de campo aponta 20 h a menos.",
          },
        });
        actorUserId = null;
        label = `Portal do cliente: ${client.approver.name} <${client.approver.email}>`;
        action = approved ? "APROVADO" : "CORRECAO_SOLICITADA";
      } else if (next === S.ASSINADO) {
        const sig = await prisma.signature.create({
          data: {
            measurementId: measurement.id,
            versionId: versionId!,
            approvalRequestId: requestId!,
            signerName: client.approver.name,
            signerEmail: client.approver.email,
            signedAt: at,
            ipAddress: "177.35.120.14",
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0",
            documentHash: sha256(`${number}-v${version}-assinado`),
            createdAt: at,
          },
        });
        signatureId = sig.id;
        actorUserId = null;
        label = `Portal do cliente: ${client.approver.name} <${client.approver.email}>`;
        action = "ASSINADO";
      } else if (next === S.NF_ANEXADA) {
        invoiceSeq += 1;
        const invoice = await prisma.invoice.create({
          data: {
            measurementId: measurement.id,
            number: String(invoiceSeq).padStart(6, "0"),
            series: "1",
            issueDate: at,
            amount: totals.totalAmount,
            status: plan.status === S.FATURADO ? InvoiceStatus.ENVIADA : InvoiceStatus.EMITIDA,
            sentAt: plan.status === S.FATURADO ? at : null,
            createdAt: at,
            updatedAt: at,
          },
        });
        await prisma.auditLog.create({
          data: {
            entity: "Invoice",
            entityId: invoice.id,
            action: "NF_ANEXADA" satisfies AuditAction,
            actorUserId: financeiro.id,
            actorLabel: `${financeiro.name} <${financeiro.email}>`,
            after: { number: invoice.number, amount: totals.totalAmount },
            createdAt: at,
          },
        });
        actorUserId = financeiro.id;
        label = `${financeiro.name} <${financeiro.email}>`;
      } else if (next === S.LIBERADO_FATURAMENTO || next === S.FATURADO) {
        actorUserId = financeiro.id;
        label = `${financeiro.name} <${financeiro.email}>`;
      } else if (next === S.CANCELADO) {
        actorUserId = admin.id;
        label = `${admin.name} <${admin.email}>`;
      }

      await prisma.auditLog.create({
        data: {
          entity: "Measurement",
          entityId: measurement.id,
          action,
          actorUserId,
          actorLabel: label,
          before: { status: previous },
          after: { status: next, ...(next === S.CANCELADO ? { motivo: plan.notes } : {}) },
          createdAt: at,
        },
      });
      previous = next;
      if (step === path.length) {
        await prisma.measurement.update({ where: { id: measurement.id }, data: { updatedAt: at } });
      }
    }
    void signatureId;
    console.log(
      `  ${number}  ${plan.status.padEnd(22)} ${client.tradeName.padEnd(22)} R$ ${totals.totalAmount}`,
    );
  }

  console.log("\nSeed concluído.");
  console.log(`Usuários (senha: ${SEED_PASSWORD} — somente desenvolvimento):`);
  console.log(
    "  admin@demo.local | operacional@demo.local | financeiro@demo.local | cliente@demo.local",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
