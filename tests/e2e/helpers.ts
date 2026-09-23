import { expect, type Page } from "@playwright/test";

export const SENHA = process.env.SEED_PASSWORD ?? "Demo@2026";

export const USUARIOS = {
  admin: { email: "admin@demo.local", nome: "Ana Administradora", perfil: "Administrador" },
  operacional: {
    email: "operacional@demo.local",
    nome: "Otávio Operacional",
    perfil: "Operacional",
  },
  financeiro: { email: "financeiro@demo.local", nome: "Fábio Financeiro", perfil: "Financeiro" },
  cliente: { email: "cliente@demo.local", nome: "Carla Menezes", perfil: "Cliente" },
} as const;

export type Perfil = keyof typeof USUARIOS;

export async function login(page: Page, perfil: Perfil, senha = SENHA) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(USUARIOS[perfil].email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Gera um CNPJ válido aleatório (para cadastros de teste sem colidir com o seed). */
export function cnpjAleatorio(): string {
  const base = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join("") + "0001";
  const calc = (b: string, w: number[]) => {
    const sum = b.split("").reduce((acc, ch, i) => acc + Number(ch) * (w[i] ?? 0), 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = calc(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base}${d1}${d2}`;
}
