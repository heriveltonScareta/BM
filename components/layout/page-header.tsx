import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  titulo,
  descricao,
  acoes,
  className,
}: {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between", className)}
    >
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
        {descricao ? <p className="mt-0.5 text-sm text-muted-foreground">{descricao}</p> : null}
      </div>
      {acoes ? <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div> : null}
    </div>
  );
}
