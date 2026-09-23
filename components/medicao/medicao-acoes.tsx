"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCheck, Loader2, Play, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MeasurementStatus as S } from "@/lib/db/generated/enums";
import { api, ApiClientError } from "@/lib/api/client";

interface AcaoDef {
  to: S;
  label: string;
  icon: React.ReactNode;
  variant?: "default" | "outline";
  confirmacao?: { titulo: string; descricao: string; botao: string; motivo?: boolean };
}

function acoesDisponiveis(status: S, permitidas: S[]): AcaoDef[] {
  const defs: AcaoDef[] = [];
  if (permitidas.includes(S.EM_ELABORACAO) && status === S.RASCUNHO) {
    defs.push({ to: S.EM_ELABORACAO, label: "Iniciar elaboração", icon: <Play aria-hidden /> });
  }
  if (permitidas.includes(S.EM_ELABORACAO) && status === S.AGUARDANDO_ENVIO) {
    defs.push({
      to: S.EM_ELABORACAO,
      label: "Voltar para elaboração",
      icon: <Undo2 aria-hidden />,
      variant: "outline",
    });
  }
  if (permitidas.includes(S.AGUARDANDO_ENVIO)) {
    defs.push({
      to: S.AGUARDANDO_ENVIO,
      label: "Pronta para envio",
      icon: <CheckCheck aria-hidden />,
      confirmacao: {
        titulo: "Marcar como pronta para envio?",
        descricao:
          "Confirme que mão de obra, equipamentos e valores estão conferidos. Os itens continuam editáveis até o envio ao cliente.",
        botao: "Marcar como pronta",
      },
    });
  }
  if (permitidas.includes(S.CANCELADO)) {
    defs.push({
      to: S.CANCELADO,
      label: "Cancelar medição",
      icon: <Ban aria-hidden />,
      variant: "outline",
      confirmacao: {
        titulo: "Cancelar esta medição?",
        descricao:
          "A medição vai para o status Cancelado, que é definitivo. O número não é reaproveitado.",
        botao: "Cancelar medição",
        motivo: true,
      },
    });
  }
  return defs;
}

export function MedicaoAcoes({
  medicaoId,
  status,
  permitidas,
}: {
  medicaoId: string;
  status: S;
  permitidas: S[];
}) {
  const router = useRouter();
  const [pendente, setPendente] = useState<AcaoDef | null>(null);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const acoes = acoesDisponiveis(status, permitidas);

  async function executar(acao: AcaoDef) {
    setBusy(true);
    try {
      await api(`/api/medicoes/${medicaoId}/status`, {
        method: "POST",
        json: { to: acao.to, reason: motivo || undefined },
      });
      toast.success("Status atualizado.");
      setPendente(null);
      setMotivo("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Não foi possível alterar o status.");
    } finally {
      setBusy(false);
    }
  }

  if (acoes.length === 0) return null;

  return (
    <>
      {acoes.map((a) => (
        <Button
          key={a.to}
          size="sm"
          variant={a.variant ?? "default"}
          className={a.to === S.CANCELADO ? "text-status-red" : undefined}
          disabled={busy}
          onClick={() => (a.confirmacao ? setPendente(a) : void executar(a))}
        >
          {busy && !a.confirmacao ? <Loader2 className="animate-spin" aria-hidden /> : a.icon}{" "}
          {a.label}
        </Button>
      ))}
      <AlertDialog open={pendente !== null} onOpenChange={(o) => !o && !busy && setPendente(null)}>
        <AlertDialogContent>
          {pendente?.confirmacao ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{pendente.confirmacao.titulo}</AlertDialogTitle>
                <AlertDialogDescription>{pendente.confirmacao.descricao}</AlertDialogDescription>
              </AlertDialogHeader>
              {pendente.confirmacao.motivo ? (
                <div className="grid gap-2">
                  <Label htmlFor="motivo">Motivo (obrigatório)</Label>
                  <Textarea
                    id="motivo"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    rows={3}
                    maxLength={1000}
                  />
                </div>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={busy || (pendente.confirmacao.motivo && !motivo.trim())}
                  onClick={(e) => {
                    e.preventDefault();
                    void executar(pendente);
                  }}
                >
                  {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  {pendente.confirmacao.botao}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
