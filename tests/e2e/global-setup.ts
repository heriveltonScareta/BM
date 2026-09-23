import { execSync } from "node:child_process";

/**
 * Recria o seed antes da suite E2E para que cada execucao parta do mesmo estado
 * (os testes alteram medicoes do seed: enviam, aprovam, faturam...).
 */
export default function globalSetup() {
  execSync("npm run db:seed", { stdio: "inherit", env: { ...process.env, SEED_RESET: "1" } });
}
