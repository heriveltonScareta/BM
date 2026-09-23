import { defineConfig } from "prisma/config";

// Carrega .env sem dependencia extra (Node >= 20.12). Ignora se nao existir.
try {
  process.loadEnvFile(".env");
} catch {
  // sem .env: as variaveis devem vir do ambiente
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.mts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
