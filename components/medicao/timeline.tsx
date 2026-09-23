import {
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  FileEdit,
  FilePlus2,
  ListPlus,
  ListX,
  MailCheck,
  PenLine,
  Receipt,
  Send,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils/dates";
import { STATUS_LABELS } from "@/lib/services/status-machine";
import type { MeasurementStatus } from "@/lib/db/generated/enums";
import type { AuditAction } from "@/lib/services/audit.service";
import { EstadoVazio } from "@/components/estados";

export interface TimelineEntry {
  id: string;
  entity: string;
  action: string;
  actorLabel: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

const ICONS: Partial<Record<AuditAction, LucideIcon>> = {
  MEDICAO_CRIADA: FilePlus2,
  MEDICAO_ALTERADA: FileEdit,
  STATUS_ALTERADO: ArrowRightLeft,
  ITEM_CRIADO: ListPlus,
  ITEM_ALTERADO: FileEdit,
  ITEM_EXCLUIDO: ListX,
  ITENS_IMPORTADOS: Upload,
  VERSAO_CRIADA: FilePlus2,
  ENVIADO_AO_CLIENTE: Send,
  ABERTO_PELO_CLIENTE: MailCheck,
  APROVADO: CheckCircle2,
  CORRECAO_SOLICITADA: Ban,
  ASSINADO: PenLine,
  NF_ANEXADA: Receipt,
  DOCUMENTO_ENVIADO: Upload,
  ESTORNO: ArrowRightLeft,
};

export const AUDIT_ACTION_LABELS: Partial<Record<AuditAction, string>> = {
  MEDICAO_CRIADA: "Medição criada",
  MEDICAO_ALTERADA: "Dados da medição alterados",
  MEDICAO_EXCLUIDA: "Medição excluída",
  STATUS_ALTERADO: "Status alterado",
  ITEM_CRIADO: "Item adicionado",
  ITEM_ALTERADO: "Item alterado",
  ITEM_EXCLUIDO: "Item excluído",
  ITENS_IMPORTADOS: "Itens importados de planilha",
  VERSAO_CRIADA: "Versão congelada",
  ENVIADO_AO_CLIENTE: "Enviado ao cliente",
  ABERTO_PELO_CLIENTE: "Aberto pelo cliente",
  APROVADO: "Aprovado pelo cliente",
  CORRECAO_SOLICITADA: "Correção solicitada pelo cliente",
  ASSINADO: "Assinado eletronicamente",
  DOCUMENTO_ENVIADO: "Documento anexado",
  DOCUMENTO_REMOVIDO: "Documento removido",
  NF_ANEXADA: "Nota fiscal anexada",
  NF_ALTERADA: "Nota fiscal alterada",
  ESTORNO: "Estorno",
};

function detalhe(e: TimelineEntry): string | null {
  const after = (e.after ?? {}) as Record<string, unknown>;
  const before = (e.before ?? {}) as Record<string, unknown>;
  if (
    e.action === "STATUS_ALTERADO" ||
    e.action === "ENVIADO_AO_CLIENTE" ||
    e.action === "APROVADO" ||
    e.action === "CORRECAO_SOLICITADA" ||
    e.action === "ASSINADO" ||
    e.action === "ABERTO_PELO_CLIENTE"
  ) {
    const de = before.status ? STATUS_LABELS[before.status as MeasurementStatus] : null;
    const para = after.status ? STATUS_LABELS[after.status as MeasurementStatus] : null;
    const motivo = typeof after.motivo === "string" ? ` · Motivo: ${after.motivo}` : "";
    return de && para ? `${de} → ${para}${motivo}` : para ? `${para}${motivo}` : null;
  }
  if (e.entity === "LaborItem" || e.entity === "EquipmentItem") {
    const label = (after.role ?? after.name ?? before.role ?? before.name) as string | undefined;
    const code = (after.code ?? before.code) as string | undefined;
    if (
      e.action === "ITEM_ALTERADO" &&
      before.totalPrice !== undefined &&
      after.totalPrice !== undefined &&
      before.totalPrice !== after.totalPrice
    ) {
      return `${code ?? ""} ${label ?? ""} · total ${String(before.totalPrice)} → ${String(after.totalPrice)}`.trim();
    }
    return [code, label].filter(Boolean).join(" ") || null;
  }
  if (e.action === "MEDICAO_ALTERADA" && typeof after.totalAmount === "string") {
    return `Total da medição: ${after.totalAmount}`;
  }
  if (e.action === "VERSAO_CRIADA" && after.version !== undefined)
    return `Versão ${String(after.version)}`;
  if (e.action === "NF_ANEXADA" && after.number !== undefined) return `NF ${String(after.number)}`;
  return null;
}

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0)
    return (
      <EstadoVazio
        titulo="Sem eventos"
        descricao="Nenhum evento registrado para esta medição."
        className="py-8"
      />
    );
  return (
    <ol className="relative space-y-4 border-l pl-6" aria-label="Histórico da medição">
      {entries.map((e) => {
        const Icon = ICONS[e.action as AuditAction] ?? FileEdit;
        const det = detalhe(e);
        return (
          <li key={e.id} className="relative">
            <span className="absolute -left-[31px] flex size-5 items-center justify-center rounded-full border bg-background">
              <Icon className="size-3" aria-hidden />
            </span>
            <div className="text-sm font-medium">
              {AUDIT_ACTION_LABELS[e.action as AuditAction] ?? e.action}
            </div>
            {det ? <div className="text-sm text-muted-foreground">{det}</div> : null}
            <div className="text-xs text-muted-foreground tabular">
              {formatDateTime(e.createdAt)} · {e.actorLabel}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
