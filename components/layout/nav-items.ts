import type { Action, SessionUser } from "@/lib/auth/rbac";
import { can } from "@/lib/auth/rbac";

/** Nomes de icone (serializaveis: este objeto atravessa a fronteira server -> client). */
export type NavIcon =
  | "dashboard"
  | "clientes"
  | "medicoes"
  | "nova"
  | "aprovacoes"
  | "faturamento"
  | "documentos"
  | "relatorios"
  | "configuracoes";

export interface NavItem {
  title: string;
  href: string;
  icon: NavIcon;
  /** Acao necessaria para exibir o item (a API valida de novo no servidor). */
  action: Action;
}

/** Menu lateral (Secao 15). Mao de Obra e Equipamentos sao abas da medicao, nao itens. */
export const NAV_ITEMS: readonly NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: "dashboard", action: "medicao:ver" },
  { title: "Clientes", href: "/clientes", icon: "clientes", action: "clientes:ver" },
  { title: "Boletins de Medição", href: "/medicoes", icon: "medicoes", action: "medicao:ver" },
  { title: "Nova Medição", href: "/medicoes/nova", icon: "nova", action: "medicao:criar" },
  { title: "Aprovações", href: "/aprovacoes", icon: "aprovacoes", action: "medicao:ver" },
  {
    title: "Faturamento",
    href: "/faturamento",
    icon: "faturamento",
    action: "faturamento:gerenciar",
  },
  { title: "Documentos", href: "/documentos", icon: "documentos", action: "documentos:ver" },
  { title: "Relatórios", href: "/relatorios", icon: "relatorios", action: "relatorios:ver" },
  {
    title: "Configurações",
    href: "/configuracoes",
    icon: "configuracoes",
    action: "configuracoes:ver",
  },
];

export function navItemsFor(user: SessionUser): NavItem[] {
  return NAV_ITEMS.filter((item) => can(user, item.action));
}
