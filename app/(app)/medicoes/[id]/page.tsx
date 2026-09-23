import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, CalendarRange, FileDown, FileText, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoSemPermissao } from "@/components/estados";
import { StatusBadge } from "@/components/medicao/status-badge";
import { MedicaoAcoes } from "@/components/medicao/medicao-acoes";
import { MedicaoWorkspace } from "@/components/medicao/medicao-workspace";
import { can, getScope, requireSession } from "@/lib/auth/session";
import { getMeasurement, getMeasurementTimeline } from "@/lib/services/measurement.service";
import { getApprovalStatus, listVersions } from "@/lib/services/approval.service";
import { AprovacaoBanner } from "@/components/medicao/aprovacao-banner";
import { toMeasurementDto } from "@/lib/services/measurement-dto";
import { getClient } from "@/lib/services/client.service";
import { allowedTransitions, isEditable } from "@/lib/services/status-machine";
import { NotFoundError } from "@/lib/errors";
import { idSchema } from "@/lib/validation/common";
import { competenceLabel, formatDate } from "@/lib/utils/dates";

export const metadata: Metadata = { title: "Medição" };

export default async function MedicaoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession();
  if (!can(user, "medicao:ver")) return <EstadoSemPermissao />;
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const scope = getScope(user);

  let detail;
  let timeline;
  let aprovacao;
  let versoes;
  try {
    [detail, timeline, aprovacao, versoes] = await Promise.all([
      getMeasurement(scope, id),
      getMeasurementTimeline(scope, id),
      getApprovalStatus(scope, id),
      listVersions(scope, id),
    ]);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const medicao = toMeasurementDto(detail);
  const editable =
    can(user, "medicao:editar", { clientId: medicao.client.id, status: medicao.status }) &&
    isEditable(medicao.status);
  const podeEnviar = can(user, "medicao:enviar");
  const cliente = editable || podeEnviar ? await getClient(scope, medicao.client.id) : null;
  const contratos =
    editable && cliente
      ? cliente.contracts
          .filter((c) => c.isActive || c.id === medicao.contract.id)
          .map((c) => ({ id: c.id, code: c.code, name: c.name, unit: c.unit }))
      : [];
  const aprovadores = cliente
    ? cliente.contacts
        .filter((c) => c.isActive && c.isApprover)
        .map((c) => ({ id: c.id, name: c.name, email: c.email }))
    : [];
  const permitidas = allowedTransitions(medicao.status, user.role).filter(
    (s) => s !== "ENVIADO_AO_CLIENTE",
  );
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const aprovacaoInfo = {
    currentVersion: aprovacao.currentVersion,
    request: aprovacao.request
      ? {
          ...aprovacao.request,
          sentAt: aprovacao.request.sentAt.toISOString(),
          expiresAt: aprovacao.request.expiresAt.toISOString(),
          openedAt: iso(aprovacao.request.openedAt),
          decidedAt: iso(aprovacao.request.decidedAt),
        }
      : null,
    signature: aprovacao.signature
      ? { ...aprovacao.signature, signedAt: aprovacao.signature.signedAt.toISOString() }
      : null,
  };

  return (
    <>
      <PageHeader
        titulo={medicao.number}
        descricao={`${medicao.client.tradeName} · ${competenceLabel(medicao.competence)}`}
        acoes={
          <>
            <StatusBadge status={medicao.status} className="text-sm" />
            {medicao.currentVersion > 0 ? (
              <span className="text-xs text-muted-foreground">v{medicao.currentVersion}</span>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <a href={`/api/medicoes/${medicao.id}/pdf?inline=1`} target="_blank" rel="noopener">
                <FileDown aria-hidden /> Gerar PDF
              </a>
            </Button>
            <MedicaoAcoes
              medicaoId={medicao.id}
              numero={medicao.number}
              status={medicao.status}
              permitidas={permitidas}
              podeEnviar={podeEnviar}
              aprovadores={aprovadores}
            />
          </>
        }
      />
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-start gap-2">
          <Building2 className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
          <div>
            <dt className="text-xs text-muted-foreground">Cliente</dt>
            <dd>
              {can(user, "clientes:ver") ? (
                <Link
                  href={`/clientes/${medicao.client.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {medicao.client.legalName}
                </Link>
              ) : (
                medicao.client.legalName
              )}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
          <div>
            <dt className="text-xs text-muted-foreground">Contrato</dt>
            <dd>
              {medicao.contract.code} · {medicao.contract.unit}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <CalendarRange className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
          <div>
            <dt className="text-xs text-muted-foreground">Período · Emissão</dt>
            <dd className="tabular">
              {formatDate(medicao.startDate)} a {formatDate(medicao.endDate)} ·{" "}
              {formatDate(medicao.issueDate)}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Hash className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
          <div>
            <dt className="text-xs text-muted-foreground">FRS · PC</dt>
            <dd>{[medicao.frs, medicao.purchaseOrder].filter(Boolean).join(" · ") || "—"}</dd>
          </div>
        </div>
      </dl>
      <AprovacaoBanner
        medicaoId={medicao.id}
        numero={medicao.number}
        status={medicao.status}
        info={aprovacaoInfo}
        aprovadores={aprovadores}
        podeReenviar={podeEnviar}
      />
      <MedicaoWorkspace
        key={medicao.updatedAt}
        medicao={medicao}
        editable={editable}
        contratos={contratos}
        versoes={versoes.map((v) => ({
          id: v.id,
          version: v.version,
          createdAt: v.createdAt.toISOString(),
          createdBy: v.createdBy,
          totalAmount: v.totalAmount,
          laborCount: v.laborCount,
          equipmentCount: v.equipmentCount,
          requests: v.requests.map((r) => ({
            sentToName: r.sentToName,
            sentToEmail: r.sentToEmail,
            sentAt: r.sentAt.toISOString(),
            decidedAt: iso(r.decidedAt),
            decision: r.decision,
            comment: r.comment,
          })),
          signatures: v.signatures.map((sg) => ({
            signerName: sg.signerName,
            signedAt: sg.signedAt.toISOString(),
          })),
        }))}
        timeline={timeline.map((t) => ({
          id: t.id,
          entity: t.entity,
          action: t.action,
          actorLabel: t.actorLabel,
          before: t.before,
          after: t.after,
          createdAt: t.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
