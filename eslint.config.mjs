import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "lib/db/generated/**",
    "storage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
  {
    rules: {
      // Proibido `any` (Secao 2). Excecoes exigem eslint-disable justificado.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
  {
    // Regra arquitetural (Secao 3): rotas e componentes nao falam com o Prisma diretamente.
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "hooks/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib/db/prisma",
                "@/lib/db/repositories/*",
                "@prisma/client",
                "@prisma/adapter-pg",
              ],
              message:
                "Rotas e componentes não acessam o Prisma. Use um service em @/lib/services.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
