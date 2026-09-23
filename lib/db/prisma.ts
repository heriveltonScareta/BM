import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/db/generated/client";

/**
 * Singleton do Prisma Client (Prisma 7 exige driver adapter).
 * Em desenvolvimento o cliente e guardado em globalThis para sobreviver ao HMR.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não definida.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** Cliente transacional (o que `prisma.$transaction(async (tx) => ...)` entrega). */
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
/** Aceita tanto o cliente global quanto um `tx` de transacao. */
export type Db = PrismaClient | Tx;
