import { ClipboardList } from "lucide-react";
import { config } from "@/lib/config";
import { formatCnpj } from "@/lib/validation/cnpj";

/** Layout do portal externo: sem menu, sem sessao; identifica apenas a prestadora. */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ClipboardList className="size-5" aria-hidden />
          </div>
          <div className="leading-tight">
            <p className="font-semibold">{config.company.name}</p>
            <p className="text-xs text-muted-foreground">
              CNPJ {formatCnpj(config.company.cnpj)} · Portal de aprovação de medições
            </p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-muted-foreground">
        Assinatura eletrônica simples com registro de evidências (MP 2.200-2/2001, art. 10, §2º).
        Não se trata de assinatura digital ICP-Brasil.
      </footer>
    </div>
  );
}
