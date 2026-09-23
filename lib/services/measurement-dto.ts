import type { MeasurementDetail } from "@/lib/db/repositories/measurement.repository";
import { dateToDateOnly } from "@/lib/utils/dates";
import { round2 } from "@/lib/services/calculation";

/** Item serializado (Decimal -> string) para atravessar a fronteira servidor -> cliente. */
export interface ItemDto {
  id: string;
  code: string;
  /** funcao (mao de obra) ou nome (equipamento) */
  label: string;
  description: string | null;
  quantity: string;
  unit: string;
  daysHours: string;
  unitPrice: string;
  totalPrice: string;
  sortOrder: number;
}

export interface MeasurementDto {
  id: string;
  number: string;
  status: MeasurementDetail["status"];
  currentVersion: number;
  competence: string;
  startDate: string;
  endDate: string;
  issueDate: string;
  frs: string | null;
  purchaseOrder: string | null;
  notes: string | null;
  otherAmount: string;
  discountAmount: string;
  additionAmount: string;
  taxAmount: string;
  laborTotal: string;
  equipmentTotal: string;
  subtotal: string;
  totalAmount: string;
  createdAt: string;
  updatedAt: string;
  canceledAt: string | null;
  client: MeasurementDetail["client"];
  contract: MeasurementDetail["contract"];
  owner: MeasurementDetail["owner"];
  laborItems: ItemDto[];
  equipmentItems: ItemDto[];
  counts: { versions: number; signatures: number; documents: number };
}

export function toMeasurementDto(m: MeasurementDetail): MeasurementDto {
  const item = (
    i: MeasurementDetail["laborItems"][number] | MeasurementDetail["equipmentItems"][number],
    label: string,
  ): ItemDto => ({
    id: i.id,
    code: i.code,
    label,
    description: i.description,
    quantity: i.quantity.toString(),
    unit: i.unit,
    daysHours: i.daysHours.toString(),
    unitPrice: i.unitPrice.toString(),
    totalPrice: round2(i.totalPrice.toString()).toFixed(2),
    sortOrder: i.sortOrder,
  });
  return {
    id: m.id,
    number: m.number,
    status: m.status,
    currentVersion: m.currentVersion,
    competence: m.competence,
    startDate: dateToDateOnly(m.startDate),
    endDate: dateToDateOnly(m.endDate),
    issueDate: dateToDateOnly(m.issueDate),
    frs: m.frs,
    purchaseOrder: m.purchaseOrder,
    notes: m.notes,
    otherAmount: round2(m.otherAmount.toString()).toFixed(2),
    discountAmount: round2(m.discountAmount.toString()).toFixed(2),
    additionAmount: round2(m.additionAmount.toString()).toFixed(2),
    taxAmount: round2(m.taxAmount.toString()).toFixed(2),
    laborTotal: round2(m.laborTotal.toString()).toFixed(2),
    equipmentTotal: round2(m.equipmentTotal.toString()).toFixed(2),
    subtotal: round2(m.subtotal.toString()).toFixed(2),
    totalAmount: round2(m.totalAmount.toString()).toFixed(2),
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    canceledAt: m.canceledAt ? m.canceledAt.toISOString() : null,
    client: m.client,
    contract: m.contract,
    owner: m.owner,
    laborItems: m.laborItems.map((i) => item(i, i.role)),
    equipmentItems: m.equipmentItems.map((i) => item(i, i.name)),
    counts: {
      versions: m._count.versions,
      signatures: m._count.signatures,
      documents: m._count.documents,
    },
  };
}
