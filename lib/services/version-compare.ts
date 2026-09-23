import Decimal from "decimal.js";
import type { MeasurementSnapshot, SnapshotItem } from "./snapshot";

export interface TotalDiff {
  campo: keyof MeasurementSnapshot["totals"];
  rotulo: string;
  a: string;
  b: string;
  diferenca: string;
}

export interface ItemChange {
  id: string;
  code: string;
  label: string;
  campos: Array<{ campo: keyof SnapshotItem; rotulo: string; a: string; b: string }>;
}

export interface ItemsDiff {
  adicionados: SnapshotItem[];
  removidos: SnapshotItem[];
  alterados: ItemChange[];
  inalterados: number;
}

export interface VersionComparison {
  a: number;
  b: number;
  totais: TotalDiff[];
  maoDeObra: ItemsDiff;
  equipamentos: ItemsDiff;
  cabecalho: Array<{ campo: string; rotulo: string; a: string; b: string }>;
}

const TOTAL_LABELS: Record<keyof MeasurementSnapshot["totals"], string> = {
  laborTotal: "Mão de obra",
  equipmentTotal: "Equipamentos",
  otherAmount: "Outros",
  subtotal: "Subtotal",
  discountAmount: "Descontos",
  additionAmount: "Acréscimos",
  taxAmount: "Impostos",
  totalAmount: "Total da medição",
};

const ITEM_FIELDS: Array<[keyof SnapshotItem, string]> = [
  ["code", "Código"],
  ["label", "Função/Equipamento"],
  ["description", "Descrição"],
  ["quantity", "Quantidade"],
  ["unit", "Unidade"],
  ["daysHours", "Dias/Horas"],
  ["unitPrice", "Valor unitário"],
  ["totalPrice", "Valor total"],
];

const NUMERIC: Set<keyof SnapshotItem> = new Set([
  "quantity",
  "daysHours",
  "unitPrice",
  "totalPrice",
]);

function same(field: keyof SnapshotItem, a: string | null, b: string | null): boolean {
  if (NUMERIC.has(field)) return new Decimal(a ?? 0).eq(new Decimal(b ?? 0));
  return (a ?? "") === (b ?? "");
}

function diffItems(a: SnapshotItem[], b: SnapshotItem[]): ItemsDiff {
  const byIdA = new Map(a.map((i) => [i.id, i]));
  const byIdB = new Map(b.map((i) => [i.id, i]));
  const adicionados = b.filter((i) => !byIdA.has(i.id));
  const removidos = a.filter((i) => !byIdB.has(i.id));
  const alterados: ItemChange[] = [];
  let inalterados = 0;
  for (const ia of a) {
    const ib = byIdB.get(ia.id);
    if (!ib) continue;
    const campos = ITEM_FIELDS.filter(
      ([f]) => !same(f, ia[f] as string | null, ib[f] as string | null),
    ).map(([f, rotulo]) => ({
      campo: f,
      rotulo,
      a: String(ia[f] ?? ""),
      b: String(ib[f] ?? ""),
    }));
    if (campos.length) alterados.push({ id: ia.id, code: ib.code, label: ib.label, campos });
    else inalterados += 1;
  }
  return { adicionados, removidos, alterados, inalterados };
}

/** Compara duas versoes congeladas: totais, itens adicionados/removidos/alterados e cabecalho. */
export function compareSnapshots(
  a: MeasurementSnapshot,
  b: MeasurementSnapshot,
): VersionComparison {
  const totais = (Object.keys(TOTAL_LABELS) as Array<keyof MeasurementSnapshot["totals"]>).map(
    (campo) => ({
      campo,
      rotulo: TOTAL_LABELS[campo],
      a: a.totals[campo],
      b: b.totals[campo],
      diferenca: new Decimal(b.totals[campo]).minus(a.totals[campo]).toFixed(2),
    }),
  );
  const headerFields: Array<[keyof MeasurementSnapshot["measurement"], string]> = [
    ["competence", "Competência"],
    ["startDate", "Início"],
    ["endDate", "Fim"],
    ["issueDate", "Emissão"],
    ["frs", "FRS"],
    ["purchaseOrder", "Pedido de Compra"],
    ["notes", "Observações"],
  ];
  const cabecalho: VersionComparison["cabecalho"] = headerFields
    .filter(([f]) => (a.measurement[f] ?? "") !== (b.measurement[f] ?? ""))
    .map(([f, rotulo]) => ({
      campo: String(f),
      rotulo,
      a: String(a.measurement[f] ?? ""),
      b: String(b.measurement[f] ?? ""),
    }));
  if (a.contract.id !== b.contract.id)
    cabecalho.push({
      campo: "contract",
      rotulo: "Contrato",
      a: a.contract.code,
      b: b.contract.code,
    });
  return {
    a: a.version,
    b: b.version,
    totais,
    maoDeObra: diffItems(a.laborItems, b.laborItems),
    equipamentos: diffItems(a.equipmentItems, b.equipmentItems),
    cabecalho,
  };
}
