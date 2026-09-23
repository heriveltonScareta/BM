import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../setup/db";
import { createTestUsers } from "../setup/session";
import { CNPJ_A, CNPJ_B, createClientFixture } from "../setup/fixtures";
import {
  addItem,
  createMeasurement,
  deleteItem,
  duplicateItem,
  getMeasurement,
  getMeasurementTimeline,
  getMeasurements,
  reorderItems,
  transitionMeasurement,
  updateItem,
  updateMeasurementHeader,
} from "@/lib/services/measurement.service";
import {
  createMeasurementSchema,
  laborItemSchema,
  equipmentItemSchema,
  measurementHeaderSchema,
} from "@/lib/validation/measurement";
import type { Scope } from "@/lib/auth/scope";
import { MeasurementStatus as S } from "@/lib/db/generated/enums";
import { AppError, NotFoundError, TransitionError, ValidationError } from "@/lib/errors";

const ALL: Scope = { kind: "ALL" };
const actor = { label: "teste" };

describe("measurement.service", () => {
  let users: Awaited<ReturnType<typeof createTestUsers>>;
  let a: Awaited<ReturnType<typeof createClientFixture>>;
  let b: Awaited<ReturnType<typeof createClientFixture>>;
  let id = "";

  const baseInput = (clientId: string, contractId: string) =>
    createMeasurementSchema.parse({
      clientId,
      contractId,
      competence: "03/2026",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      issueDate: "2026-03-31",
      frs: "FRS-1",
      purchaseOrder: "PC-1",
    });

  beforeAll(async () => {
    await resetDatabase();
    a = await createClientFixture("AAA", CNPJ_A);
    b = await createClientFixture("BBB", CNPJ_B);
    users = await createTestUsers(a.client.id);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("cria medição em RASCUNHO com número automático do ano da emissão", async () => {
    const m = await createMeasurement(
      users.operacional,
      baseInput(a.client.id, a.contract.id),
      actor,
    );
    id = m.id;
    expect(m.number).toBe("BM-2026-0001");
    expect(m.status).toBe(S.RASCUNHO);
    expect(m.competence).toBe("2026-03");
    const m2 = await createMeasurement(
      users.operacional,
      { ...baseInput(a.client.id, a.contract.id), issueDate: "2027-01-05" },
      actor,
    );
    expect(m2.number).toBe("BM-2027-0001");
  });

  it("rejeita contrato de outro cliente, contrato inativo e cliente inativo", async () => {
    await expect(
      createMeasurement(users.admin, baseInput(a.client.id, b.contract.id), actor),
    ).rejects.toBeInstanceOf(ValidationError);
    await prisma.contract.update({ where: { id: b.contract.id }, data: { isActive: false } });
    await expect(
      createMeasurement(users.admin, baseInput(b.client.id, b.contract.id), actor),
    ).rejects.toThrow(/inativo/);
    await prisma.contract.update({ where: { id: b.contract.id }, data: { isActive: true } });
    await prisma.client.update({ where: { id: b.client.id }, data: { isActive: false } });
    await expect(
      createMeasurement(users.admin, baseInput(b.client.id, b.contract.id), actor),
    ).rejects.toThrow(/inativo/);
    await prisma.client.update({ where: { id: b.client.id }, data: { isActive: true } });
  });

  it("adiciona 20 itens e calcula totais no servidor com arredondamento half-up", async () => {
    for (let i = 0; i < 10; i++) {
      await addItem(
        ALL,
        id,
        "mao-de-obra",
        laborItemSchema.parse({
          code: `MO-${i}`,
          role: `Função ${i}`,
          quantity: "10,5",
          unit: "h",
          unitPrice: "10,005",
        }),
        actor,
      );
    }
    for (let i = 0; i < 10; i++) {
      await addItem(
        ALL,
        id,
        "equipamentos",
        equipmentItemSchema.parse({
          code: `EQ-${i}`,
          name: `Equipamento ${i}`,
          quantity: "3",
          unit: "dia",
          unitPrice: "1.234,565",
        }),
        actor,
      );
    }
    const m = await getMeasurement(ALL, id);
    expect(m.laborItems).toHaveLength(10);
    expect(m.equipmentItems).toHaveLength(10);
    // 10,5 x 10,005 = 105,0525 -> 105,05 ; x10 = 1050,50
    expect(m.laborItems[0]?.totalPrice.toString()).toBe("105.05");
    expect(m.laborTotal.toString()).toBe("1050.5");
    // 3 x 1234,565 = 3703,695 -> 3703,70 ; x10 = 37037,00
    expect(m.equipmentItems[0]?.totalPrice.toString()).toBe("3703.7");
    expect(m.equipmentTotal.toString()).toBe("37037");
    expect(m.subtotal.toString()).toBe("38087.5");
    expect(m.totalAmount.toString()).toBe("38087.5");
    expect(m.laborItems.map((i) => i.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("editar item recalcula tudo; excluir compacta a ordem; duplicar insere logo após", async () => {
    const m = await getMeasurement(ALL, id);
    const first = m.laborItems[0]!;
    const upd = await updateItem(
      ALL,
      id,
      "mao-de-obra",
      first.id,
      laborItemSchema.parse({
        code: "MO-0",
        role: "Encarregado",
        quantity: "1",
        unit: "h",
        unitPrice: "0,1",
      }),
      actor,
    );
    expect(upd.item.totalPrice).toBe("0.10");
    expect(upd.totals.laborTotal).toBe("945.55"); // 1050.50 - 105.05 + 0.10

    const del = await deleteItem(ALL, id, "mao-de-obra", m.laborItems[1]!.id, actor);
    expect(del.totals.laborTotal).toBe("840.50");
    const afterDel = await getMeasurement(ALL, id);
    expect(afterDel.laborItems.map((i) => i.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);

    const dup = await duplicateItem(ALL, id, "mao-de-obra", first.id, actor);
    expect(dup.item.sortOrder).toBe(1);
    expect(dup.item.role).toBe("Encarregado");
    expect(dup.totals.laborTotal).toBe("840.60");
    const afterDup = await getMeasurement(ALL, id);
    expect(afterDup.laborItems.map((i) => i.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(afterDup.laborItems[1]?.id).toBe(dup.item.id);
  });

  it("reordena e valida a lista", async () => {
    const m = await getMeasurement(ALL, id);
    const ids = m.equipmentItems.map((i) => i.id);
    const reversed = [...ids].reverse();
    await reorderItems(ALL, id, "equipamentos", reversed, actor);
    const after = await getMeasurement(ALL, id);
    expect(after.equipmentItems.map((i) => i.id)).toEqual(reversed);
    await expect(
      reorderItems(ALL, id, "equipamentos", reversed.slice(1), actor),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("cabeçalho: descontos, acréscimos, impostos e outros entram no total", async () => {
    const r = await updateMeasurementHeader(
      ALL,
      id,
      measurementHeaderSchema.parse({
        contractId: a.contract.id,
        competence: "2026-03",
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        issueDate: "2026-03-31",
        frs: "FRS-1",
        otherAmount: "100",
        discountAmount: "1.000,00",
        additionAmount: "50,5",
        taxAmount: "12,345",
      }),
      actor,
    );
    // subtotal = 840,60 + 37037,00 + 100 = 37977,60 ; total = 37977,60 - 1000 + 50,50 + 12,35 = 37040,45
    expect(r.totals.subtotal).toBe("37977.60");
    expect(r.totals.totalAmount).toBe("37040.45");
    await expect(
      updateMeasurementHeader(
        ALL,
        id,
        measurementHeaderSchema.parse({
          contractId: b.contract.id,
          competence: "2026-03",
          startDate: "2026-03-01",
          endDate: "2026-03-31",
          issueDate: "2026-03-31",
        }),
        actor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("transições: operacional inicia elaboração, não cancela; cancelar exige motivo; pronta para envio exige itens", async () => {
    const op = users.operacional;
    await expect(
      transitionMeasurement(op, ALL, id, S.AGUARDANDO_ENVIO, actor),
    ).rejects.toBeInstanceOf(TransitionError);
    await expect(
      transitionMeasurement(op, ALL, id, S.CANCELADO, actor, { reason: "x" }),
    ).rejects.toBeInstanceOf(TransitionError);
    const m1 = await transitionMeasurement(op, ALL, id, S.EM_ELABORACAO, actor);
    expect(m1.status).toBe(S.EM_ELABORACAO);
    await expect(
      transitionMeasurement(users.admin, ALL, id, S.CANCELADO, actor),
    ).rejects.toBeInstanceOf(ValidationError);

    const vazia = await createMeasurement(
      users.admin,
      baseInput(a.client.id, a.contract.id),
      actor,
    );
    await transitionMeasurement(users.admin, ALL, vazia.id, S.EM_ELABORACAO, actor);
    await expect(
      transitionMeasurement(users.admin, ALL, vazia.id, S.AGUARDANDO_ENVIO, actor),
    ).rejects.toThrow(/ao menos um item/);
    const canc = await transitionMeasurement(users.admin, ALL, vazia.id, S.CANCELADO, actor, {
      reason: "Duplicada",
    });
    expect(canc.status).toBe(S.CANCELADO);
    expect(canc.canceledAt).toBeInstanceOf(Date);
    await expect(
      transitionMeasurement(users.admin, ALL, vazia.id, S.EM_ELABORACAO, actor),
    ).rejects.toBeInstanceOf(TransitionError);

    const m2 = await transitionMeasurement(op, ALL, id, S.AGUARDANDO_ENVIO, actor);
    expect(m2.status).toBe(S.AGUARDANDO_ENVIO);
    await expect(
      transitionMeasurement(users.admin, ALL, id, S.ENVIADO_AO_CLIENTE, actor),
    ).rejects.toThrow(/fluxo próprio/);
  });

  it("itens ficam bloqueados fora dos status editáveis", async () => {
    await prisma.measurement.update({ where: { id }, data: { status: S.ENVIADO_AO_CLIENTE } });
    await expect(
      addItem(
        ALL,
        id,
        "mao-de-obra",
        laborItemSchema.parse({ code: "X", role: "X", quantity: "1", unit: "h", unitPrice: "1" }),
        actor,
      ),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      updateMeasurementHeader(
        ALL,
        id,
        measurementHeaderSchema.parse({
          contractId: a.contract.id,
          competence: "2026-03",
          startDate: "2026-03-01",
          endDate: "2026-03-31",
          issueDate: "2026-03-31",
        }),
        actor,
      ),
    ).rejects.toThrow(/não pode ser alterada/);
    await prisma.measurement.update({ where: { id }, data: { status: S.AGUARDANDO_ENVIO } });
  });

  it("escopos: financeiro não vê rascunho; cliente só vê o próprio a partir do envio; outro cliente é 404", async () => {
    const fin: Scope = { kind: "FINANCEIRO" };
    const cliA: Scope = { kind: "CLIENT", clientId: a.client.id };
    const cliB: Scope = { kind: "CLIENT", clientId: b.client.id };
    expect(
      (await getMeasurements(fin, { page: 1, pageSize: 50, sort: "number", order: "asc" })).total,
    ).toBe(0);
    await expect(getMeasurement(fin, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getMeasurement(cliA, id)).rejects.toBeInstanceOf(NotFoundError); // AGUARDANDO_ENVIO ainda nao e visivel
    await prisma.measurement.update({ where: { id }, data: { status: S.APROVADO } });
    expect((await getMeasurement(cliA, id)).id).toBe(id);
    expect((await getMeasurement(fin, id)).id).toBe(id);
    await expect(getMeasurement(cliB, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getMeasurementTimeline(cliB, id)).rejects.toBeInstanceOf(NotFoundError);
    expect(
      (await getMeasurements(cliB, { page: 1, pageSize: 50, sort: "number", order: "asc" })).total,
    ).toBe(0);
    await prisma.measurement.update({ where: { id }, data: { status: S.AGUARDANDO_ENVIO } });
  });

  it("listagem: busca por número/FRS/PC, filtro por status e ordenação por cliente", async () => {
    const r1 = await getMeasurements(ALL, {
      page: 1,
      pageSize: 50,
      sort: "number",
      order: "asc",
      q: "FRS-1",
    });
    expect(r1.items.map((m) => m.number)).toEqual(
      ["BM-2026-0001", "BM-2027-0001", "BM-2026-0002"].sort(),
    );
    const r2 = await getMeasurements(ALL, {
      page: 1,
      pageSize: 50,
      sort: "number",
      order: "asc",
      status: S.CANCELADO,
    });
    expect(r2.items.map((m) => m.number)).toEqual(["BM-2026-0002"]);
    const r3 = await getMeasurements(ALL, {
      page: 1,
      pageSize: 50,
      sort: "client",
      order: "asc",
      q: "BM-2026-0001",
    });
    expect(r3.total).toBe(1);
    expect(r3.items[0]?.client.code).toBe("AAA");
  });

  it("timeline traz criação, itens e mudanças de status em ordem decrescente", async () => {
    const t = await getMeasurementTimeline(ALL, id);
    const actions = new Set(t.map((e) => e.action));
    expect(actions).toEqual(
      new Set([
        "MEDICAO_CRIADA",
        "ITEM_CRIADO",
        "ITEM_ALTERADO",
        "ITEM_EXCLUIDO",
        "MEDICAO_ALTERADA",
        "STATUS_ALTERADO",
      ]),
    );
    expect(t[t.length - 1]?.action).toBe("MEDICAO_CRIADA");
    expect(t.length).toBeGreaterThan(24);
  });
});
