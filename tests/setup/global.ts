import { execSync } from "node:child_process";

/** Aplica as migrations no banco de testes uma vez por execucao do Vitest. */
export default function globalSetup() {
  try {
    process.loadEnvFile(".env");
  } catch {
    // sem .env
  }
  const url =
    process.env.TEST_DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/bm_test?schema=public";
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
