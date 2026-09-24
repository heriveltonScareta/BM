"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  BadgeCheck,
  CircleDollarSign,
  FileDown,
  Loader2,
  Paperclip,
  TriangleAlert,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
import { EstadoVazio } from "@/components/estados";
import { MeasurementStatus as S, InvoiceStatus } from "@/lib/db/generated/enums";
import {
  invoiceSchema,
  INVOICE_STATUS_LABELS,
  type InvoiceData,
  type InvoiceInput,
} from "@/lib/validation/invoice";
import { api, ApiClientError } from "@/lib/api/client";
import { applyApiErrors } from "@/lib/api/form-errors";
import { formatCurrency } from "@/lib/utils/format";
import { formatDate } from "@/lib/utils/dates";
import { toInputNumber } from "@/lib/utils/numbers";
import { cn } from "@/lib/utils";

export interface FaturamentoInfo {
  status: S;
  totalAmount: string;
  hasSignature: boolean;
  invoice: {
    id: string;
    number: string;
    series: string | null;
    issueDate: string;
    amount: string;
    status: InvoiceStatus;
    sentAt: string | null;
    notes: string | null;
    pdfDocument: { id: string; fileName: string } | null;
    xmlDocument: { id: string; fileName: string } | null;
    alert: string | null;
  } | null;
}

const ETAPAS: Array<{ status: S; label: string }> = [
  { status: S.ASSINADO, label: "Assinado" },
  { status: S.LIBERADO_FATURAMENTO, label: "Liberado p/ faturamento" },
  { status: S.NF_ANEXADA, label: "NF anexada" },
  { status: S.FATURADO, label: "Faturado" },
];

export function FaturamentoTab({
  medicaoId,
  info,
  podeGerenciar,
}: {
  medicaoId: string;
  info: FaturamentoInfo;
  podeGerenciar: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmarFaturar, setConfirmarFaturar] = useState(false);
  const [editarNf, setEditarNf] = useState(false);
  const idx = ETAPAS.findIndex((e) => e.status === info.status);

  if (idx < 0) {
    return (
      <EstadoVazio
        titulo="Faturamento ainda não iniciado"
        descricao={
          info.invoice
            ? `A NF ${info.invoice.number} do ciclo anterior foi cancelada pelo estorno. Uma nova nota fiscal será exigida após a nova assinatura e liberação.`
            : "O faturamento começa após a assinatura eletrônica do cliente."
        }
        className="py-8"
      />
    );
  }

  async function liberar() {
    setBusy(true);
    try {
      await api(`/api/medicoes/${medicaoId}/liberar`, { method: "POST" });
      toast.success("Medição liberada para faturamento.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Não foi possível liberar.");
    } finally {
      setBusy(false);
    }
  }

  async function faturar() {
    setBusy(true);
    try {
      const r = await api<{ alert: string | null }>(`/api/medicoes/${medicaoId}/faturar`, {
        method: "POST",
      });
      toast.success("Medição faturada.");
      if (r.alert) toast.warning(r.alert);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Não foi possível faturar.");
    } finally {
      setBusy(false);
      setConfirmarFaturar(false);
    }
  }

  const mostrarFormNf =
    podeGerenciar &&
    (info.status === S.LIBERADO_FATURAMENTO ||
      (info.status === S.NF_ANEXADA && (editarNf || !info.invoice)));

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2" aria-label="Etapas do faturamento">
        {ETAPAS.map((e, i) => (
          <li
            key={e.status}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm",
              i < idx && "border-status-green/30 bg-status-green-bg text-status-green",
              i === idx && "border-primary bg-primary text-primary-foreground",
              i > idx && "text-muted-foreground",
            )}
            aria-current={i === idx ? "step" : undefined}
          >
            {i + 1}. {e.label}
          </li>
        ))}
      </ol>

      {info.status === S.ASSINADO ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Unlock className="size-5" aria-hidden /> Liberar para faturamento
            </CardTitle>
            <CardDescription>
              {info.hasSignature
                ? "A versão vigente está assinada eletronicamente pelo cliente."
                : "A versão vigente ainda não tem assinatura eletrônica; a liberação será recusada."}
            </CardDescription>
          </CardHeader>
          {podeGerenciar ? (
            <CardContent>
              <Button onClick={() => void liberar()} disabled={busy || !info.hasSignature}>
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Unlock aria-hidden />}{" "}
                Liberar para faturamento
              </Button>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      {info.invoice && !mostrarFormNf ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Paperclip className="size-5" aria-hidden /> Nota fiscal {info.invoice.number}
                {info.invoice.series ? ` · série ${info.invoice.series}` : ""}
              </CardTitle>
              <CardDescription>
                Emitida em {formatDate(info.invoice.issueDate)} ·{" "}
                {INVOICE_STATUS_LABELS[info.invoice.status]}
                {info.invoice.sentAt ? ` · enviada em ${formatDate(info.invoice.sentAt)}` : ""}
              </CardDescription>
            </div>
            {podeGerenciar && info.status === S.NF_ANEXADA ? (
              <Button variant="outline" size="sm" onClick={() => setEditarNf(true)}>
                Substituir NF
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Valor da NF</dt>
                <dd className="tabular font-medium" data-testid="nf-valor">
                  {formatCurrency(info.invoice.amount)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Total da medição</dt>
                <dd className="tabular">{formatCurrency(info.totalAmount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Arquivos</dt>
                <dd className="flex flex-wrap gap-2">
                  {info.invoice.pdfDocument ? (
                    <a
                      className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                      href={`/api/documentos/${info.invoice.pdfDocument.id}/download`}
                    >
                      <FileDown className="size-3.5" aria-hidden /> PDF
                    </a>
                  ) : null}
                  {info.invoice.xmlDocument ? (
                    <a
                      className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                      href={`/api/documentos/${info.invoice.xmlDocument.id}/download`}
                    >
                      <FileDown className="size-3.5" aria-hidden /> XML
                    </a>
                  ) : null}
                </dd>
              </div>
            </dl>
            {info.invoice.alert ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md border border-status-amber/30 bg-status-amber-bg p-2 text-status-amber"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{" "}
                {info.invoice.alert}
              </p>
            ) : null}
            {info.invoice.notes ? (
              <p className="text-muted-foreground">{info.invoice.notes}</p>
            ) : null}
            {podeGerenciar ? (
              <StatusNf
                medicaoId={medicaoId}
                status={info.invoice.status}
                sentAt={info.invoice.sentAt}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {mostrarFormNf ? (
        <NotaFiscalForm
          medicaoId={medicaoId}
          totalAmount={info.totalAmount}
          atual={info.invoice}
          onDone={() => setEditarNf(false)}
        />
      ) : null}

      {info.status === S.NF_ANEXADA && podeGerenciar && !mostrarFormNf ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BadgeCheck className="size-5" aria-hidden /> Concluir faturamento
            </CardTitle>
            <CardDescription>
              Marca a medição como faturada. Depois disso, só um estorno explícito do administrador
              reabre a medição.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setConfirmarFaturar(true)} disabled={busy}>
              <CircleDollarSign aria-hidden /> Marcar como faturado
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog
        open={confirmarFaturar}
        onOpenChange={(o) => !o && !busy && setConfirmarFaturar(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como faturado?</AlertDialogTitle>
            <AlertDialogDescription>
              NF {info.invoice?.number} no valor de {formatCurrency(info.invoice?.amount ?? "0")}.{" "}
              {info.invoice?.alert
                ? `Atenção: ${info.invoice.alert}`
                : "O valor confere com o total da medição."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void faturar();
              }}
            >
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null} Faturar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusNf({
  medicaoId,
  status,
  sentAt,
}: {
  medicaoId: string;
  status: InvoiceStatus;
  sentAt: string | null;
}) {
  const router = useRouter();
  const [valor, setValor] = useState<InvoiceStatus>(status);
  const [data, setData] = useState(sentAt ?? "");
  const [busy, setBusy] = useState(false);
  async function salvar() {
    setBusy(true);
    try {
      await api(`/api/medicoes/${medicaoId}/nota-fiscal`, {
        method: "PATCH",
        json: { status: valor, sentAt: data || null },
      });
      toast.success("Status da nota fiscal atualizado.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Não foi possível atualizar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-end gap-2 border-t pt-3">
      <div className="grid gap-1">
        <Label htmlFor="nf-status">Status da NF</Label>
        <Select value={valor} onValueChange={(v) => setValor(v as InvoiceStatus)}>
          <SelectTrigger id="nf-status" className="w-48" aria-label="Status da NF">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {INVOICE_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="nf-envio">Data de envio</Label>
        <Input
          id="nf-envio"
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="w-44"
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => void salvar()}
        disabled={busy || (valor === status && (data || "") === (sentAt ?? ""))}
      >
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : null} Salvar status
      </Button>
    </div>
  );
}

function NotaFiscalForm({
  medicaoId,
  totalAmount,
  atual,
  onDone,
}: {
  medicaoId: string;
  totalAmount: string;
  atual: FaturamentoInfo["invoice"];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pdf, setPdf] = useState<File | null>(null);
  const [xml, setXml] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const form = useForm<InvoiceInput, undefined, InvoiceData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      number: atual?.number ?? "",
      series: atual?.series ?? "",
      issueDate: atual?.issueDate ?? new Date().toISOString().slice(0, 10),
      amount: toInputNumber(atual?.amount ?? totalAmount, 2),
      notes: atual?.notes ?? "",
    },
  });

  async function onSubmit(values: InvoiceData) {
    setErroArquivo(null);
    if (!atual && (!pdf || !xml)) {
      setErroArquivo("Envie o PDF e o XML da nota fiscal.");
      return;
    }
    const fd = new FormData();
    fd.set("number", values.number);
    if (values.series) fd.set("series", values.series);
    fd.set("issueDate", values.issueDate);
    fd.set("amount", values.amount);
    if (values.notes) fd.set("notes", values.notes);
    if (pdf) fd.set("pdf", pdf);
    if (xml) fd.set("xml", xml);
    try {
      const r = await api<{ alert: string | null }>(`/api/medicoes/${medicaoId}/nota-fiscal`, {
        method: "POST",
        body: fd,
      });
      toast.success("Nota fiscal anexada.");
      if (r.alert) toast.warning(r.alert, { duration: 8000 });
      onDone();
      router.refresh();
    } catch (e) {
      if (e instanceof ApiClientError) {
        const applied = applyApiErrors(e, form.setError);
        const fileIssues = Array.isArray(e.details)
          ? (e.details as Array<{ path: string; message: string }>).filter(
              (d) => d.path === "pdf" || d.path === "xml",
            )
          : [];
        if (fileIssues.length) setErroArquivo(fileIssues.map((d) => d.message).join(" "));
        if (!applied && !fileIssues.length) setErroArquivo(e.message);
        toast.error(e.message);
      } else toast.error("Não foi possível anexar a nota fiscal.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="size-5" aria-hidden />{" "}
          {atual ? "Substituir nota fiscal" : "Anexar nota fiscal"}
        </CardTitle>
        <CardDescription>
          PDF e XML da NF-e (até 20 MB cada). O valor é comparado ao total da medição (
          {formatCurrency(totalAmount)}); divergências geram alerta, não bloqueio.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número da NF</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={30} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="series"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Série</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} maxLength={10} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="issueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de emissão</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor da NF</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={String(field.value ?? "")}
                      inputMode="decimal"
                      className="tabular text-right"
                    />
                  </FormControl>
                  <FormDescription>Ex.: 1.234,56</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-2">
              <Label htmlFor="nf-pdf">PDF da NF{atual ? " (opcional ao substituir)" : ""}</Label>
              <input
                id="nf-pdf"
                type="file"
                accept=".pdf,application/pdf"
                className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
                onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nf-xml">XML da NF{atual ? " (opcional ao substituir)" : ""}</Label>
              <input
                id="nf-xml"
                type="file"
                accept=".xml,application/xml,text/xml"
                className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
                onChange={(e) => setXml(e.target.files?.[0] ?? null)}
              />
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} rows={2} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {erroArquivo ? (
              <p role="alert" className="text-sm text-status-red sm:col-span-2 lg:col-span-4">
                {erroArquivo}
              </p>
            ) : null}
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              {atual ? (
                <Button type="button" variant="outline" onClick={onDone}>
                  Cancelar
                </Button>
              ) : null}
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Paperclip aria-hidden />
                )}{" "}
                {atual ? "Salvar nota fiscal" : "Anexar nota fiscal"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
