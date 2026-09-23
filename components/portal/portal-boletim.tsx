"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileDown,
  FileCheck2,
  Loader2,
  MessageSquareWarning,
  PenLine,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import type { PortalState } from "@/lib/services/approval.service";
import type { MeasurementSnapshot, SnapshotItem } from "@/lib/services/snapshot";
import { api, ApiClientError } from "@/lib/api/client";
import { formatCurrency, formatQuantity } from "@/lib/utils/format";
import {
  formatCompetence,
  formatDate,
  formatDateTime,
  formatDateTimeWithZone,
} from "@/lib/utils/dates";
import { formatCnpj } from "@/lib/validation/cnpj";

export interface PortalViewDto {
  state: PortalState;
  request: {
    id: string;
    sentToName: string;
    sentToEmail: string;
    sentAt: string;
    expiresAt: string;
    openedAt: string | null;
    decidedAt: string | null;
    decision: "APPROVED" | "CHANGES_REQUESTED" | null;
    comment: string | null;
  };
  measurement: { id: string; number: string; status: string; currentVersion: number };
  version: { id: string; version: number; snapshot: MeasurementSnapshot };
  signature: {
    signerName: string;
    signerEmail: string;
    signedAt: string;
    documentHash: string;
    signedDocumentId: string | null;
  } | null;
  company: { name: string; cnpj: string; email: string };
}

export function PortalBoletim({ token, view: inicial }: { token: string; view: PortalViewDto }) {
  const [view, setView] = useState(inicial);
  const sn = view.version.snapshot;
  const pdfHref = `/api/portal/${token}/pdf?inline=1`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Boletim de Medição {sn.measurement.number}</h1>
          <p className="text-sm text-muted-foreground">
            Versão {view.version.version} · {sn.client.legalName} · competência{" "}
            {formatCompetence(sn.measurement.competence)}
          </p>
          <p className="text-sm text-muted-foreground">
            Enviado para {view.request.sentToName} ({view.request.sentToEmail}) em{" "}
            {formatDateTime(view.request.sentAt)}
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={pdfHref} target="_blank" rel="noopener">
            <FileDown aria-hidden /> Abrir PDF do boletim
          </a>
        </Button>
      </div>

      <PainelDecisao token={token} view={view} onChange={setView} />

      <Card>
        <CardHeader>
          <CardTitle>Resumo</CardTitle>
          <CardDescription>
            {sn.contract.code} · {sn.contract.name} — {sn.contract.unit}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Campo
              label="Cliente"
              value={`${sn.client.legalName} · ${formatCnpj(sn.client.cnpj)}`}
            />
            <Campo
              label="Período"
              value={`${formatDate(sn.measurement.startDate)} a ${formatDate(sn.measurement.endDate)}`}
            />
            <Campo label="Emissão" value={formatDate(sn.measurement.issueDate)} />
            <Campo
              label="FRS · Pedido de Compra"
              value={
                [sn.measurement.frs, sn.measurement.purchaseOrder].filter(Boolean).join(" · ") ||
                "—"
              }
            />
          </dl>
        </CardContent>
      </Card>

      <TabelaItens
        titulo="Mão de obra"
        labelHeader="Função"
        items={sn.laborItems}
        total={sn.totals.laborTotal}
      />
      <TabelaItens
        titulo="Equipamentos"
        labelHeader="Equipamento"
        items={sn.equipmentItems}
        total={sn.totals.equipmentTotal}
      />

      <Card>
        <CardHeader>
          <CardTitle>Resumo financeiro</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="ml-auto max-w-sm space-y-1 text-sm">
            {(
              [
                ["Mão de obra", sn.totals.laborTotal],
                ["Equipamentos", sn.totals.equipmentTotal],
                ["Outros", sn.totals.otherAmount],
                ["Subtotal", sn.totals.subtotal],
                ["Descontos (−)", sn.totals.discountAmount],
                ["Acréscimos (+)", sn.totals.additionAmount],
                ["Impostos (+)", sn.totals.taxAmount],
              ] as Array<[string, string]>
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b py-1">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="tabular">{formatCurrency(v)}</dd>
              </div>
            ))}
            <div className="flex justify-between rounded-md bg-primary px-2 py-2 text-primary-foreground">
              <dt className="font-semibold">Valor total da medição</dt>
              <dd className="tabular font-semibold" data-testid="portal-total">
                {formatCurrency(sn.totals.totalAmount)}
              </dd>
            </div>
          </dl>
          {sn.measurement.notes ? (
            <div className="mt-4 text-sm">
              <span className="text-xs text-muted-foreground">Observações</span>
              <p className="whitespace-pre-line">{sn.measurement.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Campo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function TabelaItens({
  titulo,
  labelHeader,
  items,
  total,
}: {
  titulo: string;
  labelHeader: string;
  items: SnapshotItem[];
  total: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem itens.</p>
        ) : (
          <>
            <ul className="space-y-2 md:hidden">
              {items.map((i) => (
                <li key={i.id} className="rounded-md border p-2 text-sm">
                  <div className="font-medium">
                    {i.code} · {i.label}
                  </div>
                  <div className="text-muted-foreground">
                    {formatQuantity(i.quantity)} {i.unit} × {formatCurrency(i.unitPrice)} ={" "}
                    <span className="tabular text-foreground">{formatCurrency(i.totalPrice)}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-hidden rounded-md border md:block">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="h-8">Código</TableHead>
                    <TableHead className="h-8">{labelHeader}</TableHead>
                    <TableHead className="h-8">Descrição</TableHead>
                    <TableHead className="h-8 text-right">Quant.</TableHead>
                    <TableHead className="h-8">Unid.</TableHead>
                    <TableHead className="h-8 text-right">Dias/Horas</TableHead>
                    <TableHead className="h-8 text-right">Valor unit.</TableHead>
                    <TableHead className="h-8 text-right">Valor total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="py-1.5 font-mono text-xs">{i.code}</TableCell>
                      <TableCell className="py-1.5">{i.label}</TableCell>
                      <TableCell className="py-1.5 text-muted-foreground">
                        {i.description ?? ""}
                      </TableCell>
                      <TableCell className="py-1.5 text-right tabular">
                        {formatQuantity(i.quantity)}
                      </TableCell>
                      <TableCell className="py-1.5">{i.unit}</TableCell>
                      <TableCell className="py-1.5 text-right tabular">
                        {formatQuantity(i.daysHours)}
                      </TableCell>
                      <TableCell className="py-1.5 text-right tabular">
                        {formatCurrency(i.unitPrice)}
                      </TableCell>
                      <TableCell className="py-1.5 text-right tabular">
                        {formatCurrency(i.totalPrice)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
        <p className="mt-2 text-right text-sm font-medium">
          Total {titulo.toLowerCase()}: <span className="tabular">{formatCurrency(total)}</span>
        </p>
      </CardContent>
    </Card>
  );
}

function PainelDecisao({
  token,
  view,
  onChange,
}: {
  token: string;
  view: PortalViewDto;
  onChange: (v: PortalViewDto) => void;
}) {
  const router = useRouter();
  const [comentario, setComentario] = useState("");
  const [confirmar, setConfirmar] = useState<"APROVAR" | "CORRIGIR" | null>(null);
  const [nome, setNome] = useState(view.request.sentToName);
  const [ciente, setCiente] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function decidir(decision: "APROVAR" | "CORRIGIR") {
    setBusy(true);
    setErro(null);
    try {
      const v = await api<PortalViewDto>(`/api/portal/${token}/decidir`, {
        method: "POST",
        json: { decision, comment: comentario },
      });
      onChange(v);
      toast.success(
        decision === "APROVAR"
          ? "Medição aprovada. Agora você pode assinar."
          : "Correção solicitada. A prestadora foi notificada.",
      );
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof ApiClientError
          ? Array.isArray(e.details)
            ? (e.details as Array<{ message: string }>).map((d) => d.message).join(" ")
            : e.message
          : "Não foi possível registrar a decisão.";
      setErro(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      setConfirmar(null);
    }
  }

  async function assinar() {
    setBusy(true);
    setErro(null);
    try {
      const v = await api<PortalViewDto>(`/api/portal/${token}/assinar`, {
        method: "POST",
        json: { signerName: nome, accepted: ciente },
      });
      onChange(v);
      toast.success("Boletim assinado eletronicamente.");
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof ApiClientError
          ? Array.isArray(e.details)
            ? (e.details as Array<{ message: string }>).map((d) => d.message).join(" ")
            : e.message
          : "Não foi possível assinar.";
      setErro(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  if (view.state === "SUBSTITUIDA") {
    return (
      <Card className="border-status-amber/30 bg-status-amber-bg">
        <CardContent className="flex gap-3 text-sm">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-status-amber" aria-hidden />
          <p>
            Esta versão do boletim foi substituída ou a medição foi alterada pela prestadora.
            Aguarde um novo link por e-mail.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (view.state === "CORRECAO_SOLICITADA") {
    return (
      <Card className="border-status-amber/30 bg-status-amber-bg">
        <CardContent className="flex gap-3 text-sm">
          <MessageSquareWarning className="mt-0.5 size-5 shrink-0 text-status-amber" aria-hidden />
          <div>
            <p className="font-medium">
              Correção solicitada em {formatDateTime(view.request.decidedAt)}.
            </p>
            {view.request.comment ? (
              <p className="text-muted-foreground">“{view.request.comment}”</p>
            ) : null}
            <p className="mt-1 text-muted-foreground">
              A prestadora fará os ajustes e enviará uma nova versão para aprovação.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (view.state === "ASSINADO" && view.signature) {
    return (
      <Card className="border-status-green/30 bg-status-green-bg">
        <CardContent className="space-y-3 text-sm">
          <div className="flex gap-3">
            <FileCheck2 className="mt-0.5 size-5 shrink-0 text-status-green" aria-hidden />
            <div>
              <p className="font-medium">
                Boletim assinado eletronicamente por {view.signature.signerName} em{" "}
                {formatDateTimeWithZone(view.signature.signedAt)}.
              </p>
              <p className="text-muted-foreground">
                E-mail {view.signature.signerEmail} · SHA-256 do documento{" "}
                {view.signature.documentHash.slice(0, 24)}…
              </p>
            </div>
          </div>
          <Button asChild>
            <a href={`/api/portal/${token}/pdf`}>
              <FileDown aria-hidden /> Baixar PDF assinado
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (view.state === "AGUARDANDO_ASSINATURA") {
    return (
      <Card className="border-status-green/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-status-green" aria-hidden /> Medição aprovada —
            assine para concluir
          </CardTitle>
          <CardDescription>
            Ao assinar, registramos nome, e-mail, data/hora, endereço IP, navegador e o hash SHA-256
            do boletim aprovado como evidências (assinatura eletrônica simples, MP 2.200-2/2001,
            art. 10, §2º).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="signerName">Nome completo</Label>
            <Input
              id="signerName"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="signerEmail">E-mail</Label>
            <Input id="signerEmail" value={view.request.sentToEmail} readOnly aria-readonly />
          </div>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <Checkbox
              checked={ciente}
              onCheckedChange={(v) => setCiente(v === true)}
              aria-label="Declaro ciência"
              className="mt-0.5"
            />
            <span>
              Declaro que li o Boletim de Medição {view.measurement.number} (versão{" "}
              {view.version.version}) e concordo com os valores apresentados, assinando-o
              eletronicamente.
            </span>
          </label>
          {erro ? (
            <p role="alert" className="text-sm text-status-red sm:col-span-2">
              {erro}
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <Button
              onClick={() => void assinar()}
              disabled={busy || !ciente || nome.trim().length < 3}
            >
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <PenLine aria-hidden />}{" "}
              Assinar eletronicamente
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" aria-hidden /> Sua decisão
        </CardTitle>
        <CardDescription>
          Confira o boletim abaixo (ou o PDF). Este link é de uso único: a decisão não pode ser
          desfeita por aqui. Válido até {formatDateTime(view.request.expiresAt)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2">
          <Label htmlFor="comentario">Comentário (obrigatório para solicitar correção)</Label>
          <Textarea
            id="comentario"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Ex.: as horas do caminhão pipa estão 20 h acima do registro de campo."
          />
        </div>
        {erro ? (
          <p role="alert" className="text-sm text-status-red">
            {erro}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setConfirmar("APROVAR")} disabled={busy}>
            <CheckCircle2 aria-hidden /> Aprovar medição
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirmar("CORRIGIR")}
            disabled={busy || comentario.trim().length < 5}
          >
            <MessageSquareWarning aria-hidden /> Solicitar correção
          </Button>
        </div>
      </CardContent>
      <AlertDialog
        open={confirmar !== null}
        onOpenChange={(o) => !o && !busy && setConfirmar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmar === "APROVAR" ? "Aprovar esta medição?" : "Solicitar correção?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar === "APROVAR"
                ? `Você confirma a aprovação do boletim ${view.measurement.number} no valor de ${formatCurrency(view.version.snapshot.totals.totalAmount)}. Em seguida será possível assinar.`
                : "A prestadora receberá seu comentário e enviará uma nova versão. Este link deixará de valer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (confirmar) void decidir(confirmar);
              }}
            >
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {confirmar === "APROVAR" ? "Confirmar aprovação" : "Enviar solicitação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
