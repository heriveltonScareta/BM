"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Pencil, Trash2 } from "lucide-react";
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
import { api, ApiClientError } from "@/lib/api/client";

type Confirmacao = "inativar" | "ativar" | "excluir" | null;

export function ClienteAcoes({
  id,
  isActive,
  temMedicoes,
}: {
  id: string;
  isActive: boolean;
  temMedicoes: boolean;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<Confirmacao>(null);
  const [busy, setBusy] = useState(false);

  async function executar() {
    setBusy(true);
    try {
      if (confirm === "excluir") {
        await api(`/api/clientes/${id}`, { method: "DELETE" });
        toast.success("Cliente excluído.");
        router.push("/clientes");
      } else {
        const isActiveNext = confirm === "ativar";
        await api(`/api/clientes/${id}/status`, {
          method: "PATCH",
          json: { isActive: isActiveNext },
        });
        toast.success(isActiveNext ? "Cliente ativado." : "Cliente inativado.");
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Não foi possível concluir a ação.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  const textos: Record<
    Exclude<Confirmacao, null>,
    { titulo: string; descricao: string; botao: string }
  > = {
    inativar: {
      titulo: "Inativar cliente?",
      descricao:
        "O cliente deixa de aparecer na criação de novas medições. As medições existentes continuam acessíveis.",
      botao: "Inativar",
    },
    ativar: {
      titulo: "Ativar cliente?",
      descricao: "O cliente volta a aparecer na criação de novas medições.",
      botao: "Ativar",
    },
    excluir: {
      titulo: "Excluir cliente?",
      descricao:
        "O cliente será removido das listagens. Esta ação só é permitida para clientes sem medições.",
      botao: "Excluir",
    },
  };

  return (
    <>
      <Button asChild variant="outline" size="sm">
        <Link href={`/clientes/${id}/editar`}>
          <Pencil aria-hidden /> Editar
        </Link>
      </Button>
      {isActive ? (
        <Button variant="outline" size="sm" onClick={() => setConfirm("inativar")}>
          <Ban aria-hidden /> Inativar
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setConfirm("ativar")}>
          <CheckCircle2 aria-hidden /> Ativar
        </Button>
      )}
      {!temMedicoes ? (
        <Button
          variant="outline"
          size="sm"
          className="text-status-red"
          onClick={() => setConfirm("excluir")}
        >
          <Trash2 aria-hidden /> Excluir
        </Button>
      ) : null}

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && !busy && setConfirm(null)}
      >
        <AlertDialogContent>
          {confirm ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{textos[confirm].titulo}</AlertDialogTitle>
                <AlertDialogDescription>{textos[confirm].descricao}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={busy}
                  onClick={(e) => {
                    e.preventDefault();
                    void executar();
                  }}
                >
                  {textos[confirm].botao}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
