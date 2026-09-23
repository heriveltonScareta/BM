import { prisma } from "@/lib/db/prisma";

/** Limpa todas as tabelas do banco de testes (ordem respeita as FKs). */
export async function resetDatabase(): Promise<void> {
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

export { prisma };
