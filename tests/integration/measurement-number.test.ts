import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../setup/db";
import { nextMeasurementNumber } from "@/lib/services/measurement-number";
import { hashPassword } from "@/lib/auth/password";
import { Role } from "@/lib/db/generated/enums";

describe("numeração BM-AAAA-NNNN sob concorrência", () => {
  let clientId = "";
  let contractId = "";
  let userId = "";

  beforeAll(async () => {
    await resetDatabase();
    const client = await prisma.client.create({
      data: {
        code: "TST",
        legalName: "Cliente Teste",
        tradeName: "Teste",
        cnpj: "11222333000181",
        contracts: {
          create: { code: "C1", name: "Contrato", unit: "Unidade", startDate: new Date() },
        },
      },
      include: { contracts: true },
    });
    clientId = client.id;
    contractId = client.contracts[0]!.id;
    const user = await prisma.user.create({
      data: {
        name: "U",
        email: "u@t.local",
        passwordHash: await hashPassword("x"),
        role: Role.ADMIN,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("gera números sequenciais sem duplicar em 25 criações simultâneas", async () => {
    const year = 2031;
    const create = () =>
      prisma.$transaction(async (tx) => {
        const number = await nextMeasurementNumber(tx, year);
        return tx.measurement.create({
          data: {
            number,
            clientId,
            contractId,
            competence: "2031-01",
            startDate: new Date("2031-01-01T00:00:00Z"),
            endDate: new Date("2031-01-31T00:00:00Z"),
            issueDate: new Date("2031-01-31T00:00:00Z"),
            ownerUserId: userId,
          },
          select: { number: true },
        });
      });

    const results = await Promise.all(Array.from({ length: 25 }, create));
    const numbers = results.map((r) => r.number).sort();
    expect(new Set(numbers).size).toBe(25);
    expect(numbers[0]).toBe("BM-2031-0001");
    expect(numbers[24]).toBe("BM-2031-0025");
    const counter = await prisma.measurementCounter.findUnique({ where: { year } });
    expect(counter?.lastNumber).toBe(25);
  });

  it("mantém contadores independentes por ano", async () => {
    const a = await prisma.$transaction((tx) => nextMeasurementNumber(tx, 2032));
    const b = await prisma.$transaction((tx) => nextMeasurementNumber(tx, 2032));
    const c = await prisma.$transaction((tx) => nextMeasurementNumber(tx, 2031));
    expect(a).toBe("BM-2032-0001");
    expect(b).toBe("BM-2032-0002");
    expect(c).toBe("BM-2031-0026");
  });
});
