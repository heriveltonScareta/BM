import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

/** Numero de destaque (Secao 10 "Cards"): quantidade e, quando permitido, o valor somado. */
export function KpiCard({
  titulo,
  quantidade,
  valor,
  href,
  icone: Icone,
  destaque,
  className,
}: {
  titulo: string;
  quantidade: number;
  /** Valor monetario (string decimal); omitido para perfis sem financeiro consolidado. */
  valor?: string | null;
  href?: string;
  icone?: LucideIcon;
  /** Chama atencao (pendencias com quantidade > 0). */
  destaque?: "amber" | "red";
  className?: string;
}) {
  const conteudo = (
    <CardContent className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{titulo}</span>
        {Icone ? <Icone className="size-4 shrink-0" aria-hidden /> : null}
      </div>
      <div
        className={cn(
          "text-2xl font-semibold tabular",
          destaque === "amber" && quantidade > 0 && "text-status-amber",
          destaque === "red" && quantidade > 0 && "text-status-red",
        )}
      >
        {quantidade}
      </div>
      {valor !== undefined && valor !== null ? (
        <div className="text-sm text-muted-foreground tabular">{formatCurrency(valor)}</div>
      ) : null}
    </CardContent>
  );
  const classes = cn("py-4", href && "transition-colors hover:bg-muted/40", className);
  if (href) {
    return (
      <Link href={href} className="block rounded-xl focus-visible:outline-2">
        <Card className={classes}>{conteudo}</Card>
      </Link>
    );
  }
  return <Card className={classes}>{conteudo}</Card>;
}
