"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiClientError } from "@/lib/api/client";
import type { SendResult } from "@/lib/services/approval.service";
import { formatDate } from "@/lib/utils/dates";

export interface AprovadorOpcao {
  id: string;
  name: string;
  email: string;
}

export function EnviarDialog({
  medicaoId,
  numero,
  aprovadores,
  reenvio,
  open,
  onClose,
}: {
  medicaoId: string;
  numero: string;
  aprovadores: AprovadorOpcao[];
  reenvio?: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [contactId, setContactId] = useState(aprovadores[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState<SendResult | null>(null);

  async function enviar() {
    setBusy(true);
    try {
      const r = await api<SendResult>(
        `/api/medicoes/${medicaoId}/${reenvio ? "reenviar" : "enviar"}`,
        { method: "POST", json: { contactId: contactId || undefined } },
      );
      setResultado(r);
      toast.success(
        r.emailSent
          ? `Enviado para ${r.sentTo.email}.`
          : "Registrado, mas o e-mail não pôde ser enviado. Reenvie o link.",
      );
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Não foi possível enviar.");
    } finally {
      setBusy(false);
    }
  }

  function fechar() {
    const enviado = resultado !== null;
    setResultado(null);
    onClose();
    // atualiza a pagina so ao fechar, para o resultado (e o link de desenvolvimento) ficar visivel
    if (enviado) router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && fechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {reenvio ? "Reenviar link de aprovação" : `Enviar ${numero} ao cliente`}
          </DialogTitle>
          <DialogDescription>
            {reenvio
              ? "Um novo link será gerado e o anterior deixará de valer."
              : "A versão atual será congelada (itens bloqueados) e o aprovador receberá um link por e-mail, válido por 7 dias e de uso único para a decisão."}
          </DialogDescription>
        </DialogHeader>
        {resultado ? (
          <div className="space-y-3 text-sm">
            <p role="status">
              Link enviado para <strong>{resultado.sentTo.name}</strong> ({resultado.sentTo.email}),
              válido até {formatDate(resultado.expiresAt)}. Versão {resultado.version}.
            </p>
            {resultado.portalUrl ? (
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="mb-1 text-xs text-muted-foreground">
                  Ambiente de desenvolvimento: o e-mail foi gravado em disco. Link de aprovação:
                </p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate text-xs" data-testid="portal-url">
                    {resultado.portalUrl}
                  </code>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label="Copiar link"
                    onClick={() => {
                      void navigator.clipboard?.writeText(resultado.portalUrl ?? "");
                      toast.success("Link copiado.");
                    }}
                  >
                    <Copy aria-hidden />
                  </Button>
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button onClick={fechar}>Fechar</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="grid gap-2">
              <Label htmlFor="aprovador">Aprovador</Label>
              {aprovadores.length === 0 ? (
                <p className="text-sm text-status-amber">
                  O cliente não tem contato aprovador ativo. Cadastre um em Clientes antes de
                  enviar.
                </p>
              ) : (
                <Select value={contactId} onValueChange={setContactId}>
                  <SelectTrigger id="aprovador" className="w-full" aria-label="Aprovador">
                    <SelectValue placeholder="Selecione o aprovador" />
                  </SelectTrigger>
                  <SelectContent>
                    {aprovadores.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} — {c.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={fechar} disabled={busy}>
                Cancelar
              </Button>
              <Button onClick={() => void enviar()} disabled={busy || !contactId}>
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}{" "}
                {reenvio ? "Reenviar" : "Enviar ao cliente"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
