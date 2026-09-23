import { redirect } from "next/navigation";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { navItemsFor } from "@/components/layout/nav-items";
import { getSessionUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const items = navItemsFor(user);

  return (
    <SidebarProvider>
      <AppSidebar items={items} user={user} />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" aria-label="Abrir ou recolher o menu" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <span className="text-sm text-muted-foreground">Boletins de Medição</span>
        </header>
        <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
