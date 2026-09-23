import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../setup/db";
import {
  createClient,
  createContact,
  createContract,
  deleteClient,
  getClients,
  getClientsForSelection,
  setClientActive,
  updateClient,
} from "@/lib/services/client.service";
import { clientSchema, contactSchema, contractSchema } from "@/lib/validation/client";
import type { Scope } from "@/lib/auth/scope";
import type { AuditActor } from "@/lib/services/audit.service";
import { ConflictError, NotFoundError } from "@/lib/errors";

const ALL: Scope = { kind: "ALL" };
const actor: AuditActor = { label: "teste", ip: "127.0.0.1" };
const q = (over: Record<string, unknown> = {}) =>
  ({
    page: 1,
    pageSize: 20,
    sort: "tradeName",
    order: "asc",
    status: "todos",
    ...over,
  }) as Parameters<typeof getClients>[1];

describe("client.service", () => {
  let ativoId = "";
  let inativoId = "";

  beforeAll(async () => {
    await resetDatabase();
    const a = await createClient(
      clientSchema.parse({
        code: "AAA",
        legalName: "Alfa Mineração S.A.",
        tradeName: "Alfa",
        cnpj: "11.222.333/0001-81",
      }),
      actor,
    );
    const b = await createClient(
      clientSchema.parse({
        code: "BBB",
        legalName: "Beta Construções Ltda",
        tradeName: "Beta",
        cnpj: "04.252.011/0001-10",
      }),
      actor,
    );
    ativoId = a.id;
    inativoId = b.id;
    await createContract(
      ALL,
      a.id,
      contractSchema.parse({
        code: "C1",
        name: "Perfuração",
        unit: "Mina",
        startDate: "2026-01-01",
      }),
      actor,
    );
    await createContract(
      ALL,
      a.id,
      contractSchema.parse({
        code: "C2",
        name: "Antigo",
        unit: "Mina",
        startDate: "2025-01-01",
        isActive: false,
      }),
      actor,
    );
    await createContact(
      ALL,
      a.id,
      contactSchema.parse({ name: "Aprovadora", email: "ap@alfa.com", isApprover: true }),
      actor,
    );
    await createContact(
      ALL,
      a.id,
      contactSchema.parse({ name: "Comum", email: "c@alfa.com" }),
      actor,
    );
    await createContract(
      ALL,
      b.id,
      contractSchema.parse({
        code: "C1",
        name: "Terraplenagem",
        unit: "Obra",
        startDate: "2026-01-01",
      }),
      actor,
    );
    await setClientActive(ALL, b.id, false, actor);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejeita CNPJ duplicado com ConflictError", async () => {
    await expect(
      createClient(
        clientSchema.parse({
          code: "CCC",
          legalName: "Outra",
          tradeName: "Outra",
          cnpj: "11222333000181",
        }),
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("lista com busca por nome, código e CNPJ (com máscara) e filtro de situação", async () => {
    expect((await getClients(ALL, q({ q: "alfa" }))).items.map((c) => c.code)).toEqual(["AAA"]);
    expect((await getClients(ALL, q({ q: "bbb" }))).items.map((c) => c.code)).toEqual(["BBB"]);
    expect((await getClients(ALL, q({ q: "04.252" }))).items.map((c) => c.code)).toEqual(["BBB"]);
    expect((await getClients(ALL, q({ status: "ativos" }))).items.map((c) => c.code)).toEqual([
      "AAA",
    ]);
    expect((await getClients(ALL, q({ status: "inativos" }))).items.map((c) => c.code)).toEqual([
      "BBB",
    ]);
  });

  it("pagina e ordena no servidor", async () => {
    const p1 = await getClients(ALL, q({ pageSize: 1, sort: "code", order: "desc" }));
    expect(p1.total).toBe(2);
    expect(p1.totalPages).toBe(2);
    expect(p1.items[0]?.code).toBe("BBB");
    const p2 = await getClients(ALL, q({ page: 2, pageSize: 1, sort: "code", order: "desc" }));
    expect(p2.items[0]?.code).toBe("AAA");
    expect(p1.items[0]?._count.contracts).toBe(1);
  });

  it("seleção para medição traz só clientes ativos, contratos ativos e aprovadores", async () => {
    const sel = await getClientsForSelection(ALL);
    expect(sel.map((c) => c.code)).toEqual(["AAA"]);
    expect(sel[0]?.contracts.map((c) => c.code)).toEqual(["C1"]);
    expect(sel[0]?.contacts.map((c) => c.email)).toEqual(["ap@alfa.com"]);
  });

  it("atualiza e registra auditoria com antes/depois", async () => {
    const after = await updateClient(
      ALL,
      ativoId,
      clientSchema.parse({
        code: "AAA",
        legalName: "Alfa Mineração S.A.",
        tradeName: "Alfa Nova",
        cnpj: "11222333000181",
      }),
      actor,
    );
    expect(after.tradeName).toBe("Alfa Nova");
    const log = await prisma.auditLog.findFirst({
      where: { entity: "Client", entityId: ativoId, action: "CLIENTE_ALTERADO" },
      orderBy: { createdAt: "desc" },
    });
    expect(log?.before).toMatchObject({ tradeName: "Alfa" });
    expect(log?.after).toMatchObject({ tradeName: "Alfa Nova" });
    expect(log?.ip).toBe("127.0.0.1");
  });

  it("escopo CLIENT só enxerga o próprio cliente; outro id vira NotFound", async () => {
    const scope: Scope = { kind: "CLIENT", clientId: ativoId };
    expect((await getClients(scope, q())).items.map((c) => c.id)).toEqual([ativoId]);
    await expect(
      updateClient(
        scope,
        inativoId,
        clientSchema.parse({
          code: "X1",
          legalName: "xxx",
          tradeName: "xx",
          cnpj: "04252011000110",
        }),
        actor,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("exclusão lógica some das listagens e é bloqueada com medições", async () => {
    await deleteClient(ALL, inativoId, actor);
    expect((await getClients(ALL, q())).items.map((c) => c.code)).toEqual(["AAA"]);
    const raw = await prisma.client.findUnique({ where: { id: inativoId } });
    expect(raw?.deletedAt).toBeInstanceOf(Date);

    const user = await prisma.user.create({
      data: { name: "u", email: "u@t.local", passwordHash: "x", role: "ADMIN" },
    });
    const contract = await prisma.contract.findFirstOrThrow({ where: { clientId: ativoId } });
    await prisma.measurement.create({
      data: {
        number: "BM-2026-9999",
        clientId: ativoId,
        contractId: contract.id,
        competence: "2026-01",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-31"),
        issueDate: new Date("2026-01-31"),
        ownerUserId: user.id,
      },
    });
    await expect(deleteClient(ALL, ativoId, actor)).rejects.toThrow(/possui medições/);
  });
});
