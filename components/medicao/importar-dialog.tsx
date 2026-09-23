"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiClientError, api } from "@/lib/api/client";
import type { ImportError } from "@/lib/excel/import";
import type { ImportSummary } from "@/lib/services/measurement.service";
import { formatCurrency } from "@/lib/utils/format";

type Modo = "adicionar" | "substituir";

export function ImportarDialog({
  medicaoId,
  open,
  onClose,
  onImported,
}: {
  medicaoId: string;
  open: boolean;
  onClose: () => void;
  onImported: (summary: ImportSummary) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [modo, setModo] = useState<Modo>("adicionar");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erros, setErros] = useState<ImportError[] | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setArquivo(null);
    setErros(null);
    setMensagem(null);
    setModo("adicionar");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function enviar() {
    if (!arquivo) {
      setMensagem("Selecione um arquivo .xlsx ou .csv.");
      return;
    }
    setBusy(true);
    setErros(null);
    setMensagem(null);
    const form = new FormData();
    form.set("file", arquivo);
    form.set("mode", modo);
    try {
      const summary = await api<ImportSummary>(`/api/medicoes/${medicaoId}/importar`, {
        method: "POST",
        body: form,
      });
      toast.success(
        `Importação concluída: ${summary.labor} de mão de obra e ${summary.equipment} de equipamentos (${summary.mode}). Total: ${formatCurrency(summary.totals.totalAmount)}.`,
      );
      onImported(summary);
      reset();
      onClose();
      router.refresh();
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "IMPORT_ERRORS" && Array.isArray(e.details)) {
        setErros(e.details as ImportError[]);
        setMensagem(e.message);
      } else if (e instanceof ApiClientError) {
        const detail = Array.isArray(e.details)
          ? (e.details as Array<{ message: string }>).map((d) => d.message).join(" ")
          : "";
        setMensagem(`${e.message} ${detail}`.trim());
      } else {
        setMensagem("Não foi possível importar. Tente novamente.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar planilha</DialogTitle>
          <DialogDescription>
            Use o modelo com as abas <strong>Mao de Obra</strong> e <strong>Equipamentos</strong>. A
            coluna &quot;Valor Total&quot; é recalculada. Se houver qualquer erro, nada é importado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a href="/api/medicoes/modelo-importacao" download>
                <Download aria-hidden /> Baixar modelo (.xlsx)
              </a>
            </Button>
            <span className="text-xs text-muted-foreground">
              Até 10 MB e 5.000 linhas. Aceita .xlsx e .csv.
            </span>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="arquivo-importacao">Arquivo</Label>
            <input
              id="arquivo-importacao"
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
              onChange={(e) => {
                setArquivo(e.target.files?.[0] ?? null);
                setErros(null);
                setMensagem(null);
              }}
            />
          </div>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Modo de importação</legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="modo"
                value="adicionar"
                checked={modo === "adicionar"}
                onChange={() => setModo("adicionar")}
                className="mt-1"
              />
              <span>
                <span className="font-medium">Adicionar</span> aos itens existentes
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="modo"
                value="substituir"
                checked={modo === "substituir"}
                onChange={() => setModo("substituir")}
                className="mt-1"
              />
              <span>
                <span className="font-medium">Substituir</span> os itens existentes das abas
                presentes no arquivo
              </span>
            </label>
          </fieldset>

          {mensagem ? (
            <p role="alert" className="text-sm text-status-red">
              {mensagem}
            </p>
          ) : null}

          {erros && erros.length > 0 ? (
            <div className="overflow-hidden rounded-md border">
              <Table className="text-xs" aria-label="Erros da importação">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="h-8">Aba</TableHead>
                    <TableHead className="h-8 text-right">Linha</TableHead>
                    <TableHead className="h-8">Coluna</TableHead>
                    <TableHead className="h-8">Valor recebido</TableHead>
                    <TableHead className="h-8">Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {erros.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell className="py-1.5">{e.aba}</TableCell>
                      <TableCell className="py-1.5 text-right tabular">{e.linha || "—"}</TableCell>
                      <TableCell className="py-1.5">{e.coluna}</TableCell>
                      <TableCell
                        className="max-w-40 truncate py-1.5 font-mono"
                        title={e.valorRecebido}
                      >
                        {e.valorRecebido}
                      </TableCell>
                      <TableCell className="py-1.5">{e.motivo}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={() => void enviar()} disabled={busy || !arquivo}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}{" "}
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExportarButton({ medicaoId, numero }: { medicaoId: string; numero: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={`/api/medicoes/${medicaoId}/exportar`} download={`${numero}-itens.xlsx`}>
        <FileSpreadsheet aria-hidden /> Exportar planilha
      </a>
    </Button>
  );
}
