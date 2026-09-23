"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Campo de busca global do cabecalho: Enter leva a /busca?q=… (resultados por escopo). */
export function BuscaGlobal({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const inicial = pathname === "/busca" ? (params.get("q") ?? "") : "";
  const [valor, setValor] = React.useState(inicial);

  return (
    <form
      role="search"
      className={cn("relative w-full max-w-sm", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const q = valor.trim();
        if (q.length < 2) return;
        router.push(`/busca?q=${encodeURIComponent(q)}`);
      }}
    >
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        name="q"
        aria-label="Busca global"
        placeholder="Buscar BM, FRS, PC, NF, contrato ou cliente…"
        className="h-8 pl-8"
        value={valor}
        minLength={2}
        onChange={(e) => setValor(e.target.value)}
      />
    </form>
  );
}
