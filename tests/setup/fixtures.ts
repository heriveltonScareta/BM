import { prisma } from "@/lib/db/prisma";

/** Cria um cliente ativo com um contrato ativo e um aprovador. */
export async function createClientFixture(code: string, cnpj: string) {
  const client = await prisma.client.create({
    data: {
      code,
      legalName: `${code} Ltda`,
      tradeName: code,
      cnpj,
      contracts: {
        create: {
          code: `CT-${code}`,
          name: "Contrato",
          unit: "Unidade",
          startDate: new Date("2026-01-01T00:00:00Z"),
        },
      },
      contacts: {
        create: {
          name: `Aprovador ${code}`,
          email: `aprovador@${code.toLowerCase()}.local`,
          isApprover: true,
        },
      },
    },
    include: { contracts: true, contacts: true },
  });
  return { client, contract: client.contracts[0]!, approver: client.contacts[0]! };
}

export const CNPJ_A = "11222333000181";
export const CNPJ_B = "04252011000110";
export const CNPJ_C = "00000000000191";
