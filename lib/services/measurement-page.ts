import type { Scope } from "@/lib/auth/scope";
import { can, type SessionUser } from "@/lib/auth/rbac";
import { getMeasurement, timelineFor } from "@/lib/services/measurement.service";
import { approvalStatusFor, listVersionsFor } from "@/lib/services/approval.service";
import { billingInfoFor } from "@/lib/services/billing.service";
import { measurementDocumentsFor } from "@/lib/services/document.service";
import { getClient } from "@/lib/services/client.service";
import { isEditable } from "@/lib/services/status-machine";

/**
 * Tudo que a pagina da medicao precisa, com UMA verificacao de escopo e o restante em paralelo
 * (antes eram seis buscas identicas da medicao mais consultas encadeadas).
 */
export async function getMeasurementWorkspace(user: SessionUser, scope: Scope, id: string) {
  const detail = await getMeasurement(scope, id);
  const editable =
    can(user, "medicao:editar", { clientId: detail.clientId, status: detail.status }) &&
    isEditable(detail.status);
  const podeEnviar = can(user, "medicao:enviar");
  const auditoria = can(user, "auditoria:ver");
  const [timeline, aprovacao, versoes, faturamento, documentos, cliente] = await Promise.all([
    timelineFor(id, { full: auditoria, hideActorEmail: user.role === "CLIENTE" }),
    approvalStatusFor(detail, { evidence: auditoria }),
    listVersionsFor(id, { evidence: auditoria }),
    billingInfoFor(detail),
    measurementDocumentsFor(scope, id),
    editable || podeEnviar ? getClient(scope, detail.clientId) : Promise.resolve(null),
  ]);
  return {
    detail,
    editable,
    podeEnviar,
    timeline,
    aprovacao,
    versoes,
    faturamento,
    documentos,
    cliente,
  };
}
