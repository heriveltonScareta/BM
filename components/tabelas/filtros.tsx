"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUrlState } from "@/hooks/use-url-state";
import { cn } from "@/lib/utils";

/** Campo de busca ligado ao parametro `q` da URL, com debounce. */
export function BuscaUrl({
  placeholder = "Buscar…",
  className,
}: {
  placeholder?: string;
  className?: string;
}) {
  const { searchParams, setParams } = useUrlState();
  const initial = searchParams.get("q") ?? "";
  const [value, setValue] = React.useState(initial);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  function commit(next: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => setParams({ q: next.trim() || null }, { resetPage: true }),
      300,
    );
  }

  return (
    <div className={cn("relative w-full sm:max-w-xs", className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        aria-label="Buscar"
        placeholder={placeholder}
        className="pl-8 pr-8"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          commit(e.target.value);
        }}
      />
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute top-1/2 right-1 -translate-y-1/2"
          aria-label="Limpar busca"
          onClick={() => {
            setValue("");
            if (timer.current) clearTimeout(timer.current);
            setParams({ q: null }, { resetPage: true });
          }}
        >
          <X aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}

/** Select ligado a um parametro da URL. */
export function SelectUrl({
  param,
  label,
  options,
  defaultValue,
  className,
}: {
  param: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  defaultValue: string;
  className?: string;
}) {
  const { searchParams, setParams } = useUrlState();
  const value = searchParams.get(param) ?? defaultValue;
  return (
    <Select
      value={value}
      onValueChange={(v) =>
        setParams({ [param]: v === defaultValue ? null : v }, { resetPage: true })
      }
    >
      <SelectTrigger className={cn("w-full sm:w-44", className)} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
