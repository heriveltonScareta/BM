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
