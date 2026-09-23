import { computeTotals, totalsToStrings } from "./calculation";

/**
 * Formato do snapshot imutavel gravado em MeasurementVersion.snapshot a cada envio.
 * Tudo em strings/ISO para ser serializavel e comparavel entre versoes.
 */
export interface SnapshotItem {
  id: string;
  code: string;
  /** Funcao (mao de obra) ou nome (equipamento) */
  label: string;
  description: string | null;
  quantity: string;
  unit: string;
  daysHours: string;
  unitPrice: string;
  totalPrice: string;
  sortOrder: number;
}

export interface MeasurementSnapshot {
  version: number;
  createdAt: string;
  measurement: {
    id: string;
    number: string;
    competence: string;
    startDate: string;
    endDate: string;
    issueDate: string;
    frs: string | null;
    purchaseOrder: string | null;
    notes: string | null;
  };
  client: { id: string; legalName: string; tradeName: string; cnpj: string };
  contract: { id: string; code: string; name: string; unit: string };
  laborItems: SnapshotItem[];
  equipmentItems: SnapshotItem[];
  totals: {
    laborTotal: string;
    equipmentTotal: string;
    otherAmount: string;
    subtotal: string;
    discountAmount: string;
    additionAmount: string;
    taxAmount: string;
    totalAmount: string;
  };
}

interface DecimalLike {
  toString(): string;
}

interface ItemInput {
  id: string;
  code: string;
  description: string | null;
  quantity: DecimalLike;
  unit: string;
  daysHours: DecimalLike;
  unitPrice: DecimalLike;
  totalPrice: DecimalLike;
  sortOrder: number;
}

export interface SnapshotSource {
  id: string;
  number: string;
  competence: string;
  startDate: Date;
  endDate: Date;
  issueDate: Date;
  frs: string | null;
  purchaseOrder: string | null;
  notes: string | null;
  otherAmount: DecimalLike;
  discountAmount: DecimalLike;
  additionAmount: DecimalLike;
  taxAmount: DecimalLike;
  client: { id: string; legalName: string; tradeName: string; cnpj: string };
  contract: { id: string; code: string; name: string; unit: string };
  laborItems: Array<ItemInput & { role: string }>;
  equipmentItems: Array<ItemInput & { name: string }>;
}

function toItem(item: ItemInput, label: string): SnapshotItem {
  return {
    id: item.id,
    code: item.code,
    label,
    description: item.description,
    quantity: item.quantity.toString(),
    unit: item.unit,
    daysHours: item.daysHours.toString(),
    unitPrice: item.unitPrice.toString(),
    totalPrice: item.totalPrice.toString(),
    sortOrder: item.sortOrder,
  };
}

export function buildSnapshot(
  source: SnapshotSource,
  version: number,
  createdAt: Date = new Date(),
): MeasurementSnapshot {
  const laborItems = [...source.laborItems]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((i) => toItem(i, i.role));
  const equipmentItems = [...source.equipmentItems]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((i) => toItem(i, i.name));
  const totals = totalsToStrings(
    computeTotals({
      laborItems: source.laborItems.map((i) => ({ totalPrice: i.totalPrice.toString() })),
      equipmentItems: source.equipmentItems.map((i) => ({ totalPrice: i.totalPrice.toString() })),
      otherAmount: source.otherAmount.toString(),
      discountAmount: source.discountAmount.toString(),
      additionAmount: source.additionAmount.toString(),
      taxAmount: source.taxAmount.toString(),
    }),
  );
  return {
    version,
    createdAt: createdAt.toISOString(),
    measurement: {
      id: source.id,
      number: source.number,
      competence: source.competence,
      startDate: source.startDate.toISOString().slice(0, 10),
      endDate: source.endDate.toISOString().slice(0, 10),
      issueDate: source.issueDate.toISOString().slice(0, 10),
      frs: source.frs,
      purchaseOrder: source.purchaseOrder,
      notes: source.notes,
    },
    client: source.client,
    contract: source.contract,
    laborItems,
    equipmentItems,
    totals,
  };
}
