import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, CalendarRange, FileText, User } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoSemPermissao } from "@/components/estados";
import { StatusBadge } from "@/components/medicao/status-badge";
import { MedicaoAcoes } from "@/components/medicao/medicao-acoes";
import { MedicaoWorkspace } from "@/components/medicao/medicao-workspace";
import { can, getScope, requireSession } from "@/lib/auth/session";
import { getMeasurement, getMeasurementTimeline } from "@/lib/services/measurement.service";
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
  try {
    [detail, timeline] = await Promise.all([
      getMeasurement(scope, id),
      getMeasurementTimeline(scope, id),
    ]);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const medicao = toMeasurementDto(detail);
  const editable =
    can(user, "medicao:editar", { clientId: medicao.client.id, status: medicao.status }) &&
    isEditable(medicao.status);
  const contratos = editable
    ? (await getClient(scope, medicao.client.id)).contracts
        .filter((c) => c.isActive || c.id === medicao.contract.id)
        .map((c) => ({ id: c.id, code: c.code, name: c.name, unit: c.unit }))
    : [];
  const permitidas = allowedTransitions(medicao.status, user.role).filter(
    (s) => s !== "ENVIADO_AO_CLIENTE",
  );

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
            <MedicaoAcoes medicaoId={medicao.id} status={medicao.status} permitidas={permitidas} />
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
          <User className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
          <div>
            <dt className="text-xs text-muted-foreground">FRS · PC</dt>
            <dd>{[medicao.frs, medicao.purchaseOrder].filter(Boolean).join(" · ") || "—"}</dd>
          </div>
        </div>
      </dl>
      <MedicaoWorkspace
        medicao={medicao}
        editable={editable}
        contratos={contratos}
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
