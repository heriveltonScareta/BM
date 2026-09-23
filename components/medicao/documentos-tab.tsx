"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileDown, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EstadoVazio } from "@/components/estados";
import { api, ApiClientError } from "@/lib/api/client";
import { DOCUMENT_TYPE_LABELS } from "@/lib/validation/invoice";
import type { DocumentType } from "@/lib/db/generated/enums";
import { formatBytes } from "@/lib/utils/format";
import { formatDateTime } from "@/lib/utils/dates";

export interface DocumentoRow {
  id: string;
  type: DocumentType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  createdAt: string;
  uploadedBy: string | null;
}

export function DocumentosTab({
  medicaoId,
  documentos,
  podeUpload,
  cancelada,
}: {
  medicaoId: string;
  documentos: DocumentoRow[];
  podeUpload: boolean;
  cancelada: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(file: File) {
    setBusy(true);
    setErro(null);
    const fd = new FormData();
    fd.set("file", file);
    try {
      await api(`/api/medicoes/${medicaoId}/documentos`, { method: "POST", body: fd });
      toast.success("Documento anexado.");
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof ApiClientError && Array.isArray(e.details)
          ? (e.details as Array<{ message: string }>).map((d) => d.message).join(" ")
          : e instanceof ApiClientError
            ? e.message
            : "Não foi possível anexar.";
      setErro(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remover(doc: DocumentoRow) {
    try {
      await api(`/api/documentos/${doc.id}`, { method: "DELETE" });
      toast.success("Documento removido.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Não foi possível remover.");
    }
  }

  return (
    <div className="space-y-4">
      {podeUpload && !cancelada ? (
        <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-3">
          <div className="grid gap-1">
            <Label htmlFor="doc-file">Anexar documento (PDF, XML, PNG ou JPEG)</Label>
            <input
              id="doc-file"
              ref={fileRef}
              type="file"
              accept=".pdf,.xml,.png,.jpg,.jpeg"
              disabled={busy}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void enviar(f);
              }}
            />
          </div>
          {busy ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Enviando" />
          ) : (
            <Upload className="size-4 text-muted-foreground" aria-hidden />
          )}
          <span className="text-xs text-muted-foreground">
            PDF/XML até 20 MB · imagens até 5 MB
          </span>
          {erro ? (
            <p role="alert" className="w-full text-sm text-status-red">
              {erro}
            </p>
          ) : null}
        </div>
      ) : null}
      {documentos.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum documento"
          descricao="Boletins enviados, boletins assinados e notas fiscais aparecem aqui automaticamente."
          className="py-8"
        />
      ) : (
        <ul className="divide-y rounded-md border bg-card" aria-label="Documentos da medição">
          {documentos.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{DOCUMENT_TYPE_LABELS[d.type]}</Badge>
                  <span className="truncate font-medium">{d.fileName}</span>
                </div>
                <div className="text-xs text-muted-foreground tabular">
                  {formatBytes(d.sizeBytes)} · {formatDateTime(d.createdAt)}
                  {d.uploadedBy ? ` · ${d.uploadedBy}` : ""} · SHA-256 {d.checksum.slice(0, 12)}…
                </div>
              </div>
              <div className="flex gap-1">
                <Button asChild size="sm" variant="outline">
                  <a href={`/api/documentos/${d.id}/download`}>
                    <FileDown aria-hidden /> Baixar
                  </a>
                </Button>
                {podeUpload && d.type === "OUTRO" ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remover ${d.fileName}`}
                    onClick={() => void remover(d)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
