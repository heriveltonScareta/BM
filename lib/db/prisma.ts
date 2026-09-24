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
  // pool explicito: cada transacao interativa segura uma conexao (DATABASE_POOL_MAX, padrao 10)
  const max = Number(process.env.DATABASE_POOL_MAX ?? "10");
  const adapter = new PrismaPg({
    connectionString,
    max: Number.isFinite(max) && max > 0 ? max : 10,
  });
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
