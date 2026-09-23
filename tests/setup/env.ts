/**
 * Carrega .env e aponta DATABASE_URL para o banco de testes (TEST_DATABASE_URL).
 * Executado antes de cada arquivo de teste.
 */
try {
  process.loadEnvFile(".env");
} catch {
  // sem .env: usa o ambiente
}
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/bm_test?schema=public";
process.env.NEXTAUTH_SECRET ??= "segredo-de-teste";
process.env.EMAIL_DEV_DIR = "/tmp/bm-emails-test";
process.env.STORAGE_LOCAL_DIR = "./storage-test";
