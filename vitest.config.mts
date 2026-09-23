import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup/env.ts"],
    globalSetup: ["tests/setup/global.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Testes de integracao compartilham o banco bm_test: executa arquivos em serie.
    fileParallelism: false,
  },
});
