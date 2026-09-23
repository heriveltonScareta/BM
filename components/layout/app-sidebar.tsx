"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  CheckSquare,
  ClipboardList,
  FileText,
  FolderOpen,
  LayoutDashboard,
  type LucideIcon,
  PlusSquare,
  Receipt,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import type { NavIcon, NavItem } from "./nav-items";
import { UserMenu } from "./user-menu";
import type { SessionUser } from "@/lib/auth/rbac";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  clientes: Building2,
  medicoes: FileText,
  nova: PlusSquare,
  aprovacoes: CheckSquare,
  faturamento: Receipt,
  documentos: FolderOpen,
  relatorios: BarChart3,
  configuracoes: Settings,
};

export function AppSidebar({ items, user }: { items: NavItem[]; user: SessionUser }) {
  const pathname = usePathname();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Boletins de Medição">
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <ClipboardList className="size-4" aria-hidden />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Boletins de Medição</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Medição e faturamento
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <nav aria-label="Menu principal">
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => {
                  const active =
                    item.href === "/medicoes"
                      ? pathname === "/medicoes" ||
                        (pathname.startsWith("/medicoes/") && pathname !== "/medicoes/nova")
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = ICONS[item.icon];
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                        <Link href={item.href} aria-current={active ? "page" : undefined}>
                          <Icon aria-hidden />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </nav>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
