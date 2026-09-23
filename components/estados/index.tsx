import Link from "next/link";
import { AlertTriangle, Inbox, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Estados obrigatorios de toda tela (Secao 15): carregando, vazio, erro, sem permissao.
 */

export function EstadoCarregando({
  linhas = 6,
  className,
}: {
  linhas?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando…</span>
      <Skeleton className="h-8 w-1/3" />
      {Array.from({ length: linhas }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

interface EstadoBaseProps {
  titulo: string;
  descricao?: string;
  acao?: { label: string; href?: string; onClick?: () => void };
  className?: string;
}

export function EstadoVazio({ titulo, descricao, acao, className }: EstadoBaseProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 text-center",
        className,
      )}
    >
      <Inbox className="mb-3 size-8 text-muted-foreground" aria-hidden />
      <h3 className="text-base font-medium">{titulo}</h3>
      {descricao ? (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{descricao}</p>
      ) : null}
      {acao ? (
        <div className="mt-5">
          {acao.href ? (
            <Button asChild>
              <Link href={acao.href}>{acao.label}</Link>
            </Button>
          ) : (
            <Button onClick={acao.onClick}>{acao.label}</Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function EstadoErro({
  titulo = "Não foi possível carregar os dados",
  descricao = "Ocorreu um erro inesperado. Tente novamente.",
  onRetry,
  className,
}: {
  titulo?: string;
  descricao?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-status-red/30 bg-status-red-bg px-6 py-12 text-center",
        className,
      )}
    >
      <AlertTriangle className="mb-3 size-8 text-status-red" aria-hidden />
      <h3 className="text-base font-medium">{titulo}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{descricao}</p>
      {onRetry ? (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          <RefreshCw aria-hidden /> Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

export function EstadoSemPermissao({
  descricao = "Seu perfil não tem acesso a esta área. Se precisar, fale com um administrador.",
  className,
}: {
  descricao?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border px-6 py-14 text-center",
        className,
      )}
    >
      <Lock className="mb-3 size-8 text-muted-foreground" aria-hidden />
      <h3 className="text-base font-medium">Sem permissão</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{descricao}</p>
      <Button asChild variant="outline" className="mt-5">
        <Link href="/dashboard">Voltar ao início</Link>
      </Button>
    </div>
  );
}
