"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ResumoFinanceiro } from "@/components/medicao/resumo-financeiro";
import { ItensGrid } from "@/components/medicao/itens-grid";
import { CabecalhoForm, type ContratoOpcao } from "@/components/medicao/cabecalho-form";
import { Timeline, type TimelineEntry } from "@/components/medicao/timeline";
import type { MeasurementDto } from "@/lib/services/measurement-dto";
import type { MeasurementTotals } from "@/lib/services/measurement.service";
import { useUrlState } from "@/hooks/use-url-state";

export function MedicaoWorkspace({
  medicao,
  editable,
  contratos,
  timeline,
}: {
  medicao: MeasurementDto;
  editable: boolean;
  contratos: ContratoOpcao[];
  timeline: TimelineEntry[];
}) {
  const [totals, setTotals] = useState<MeasurementTotals>({
    laborTotal: medicao.laborTotal,
    equipmentTotal: medicao.equipmentTotal,
    otherAmount: medicao.otherAmount,
    subtotal: medicao.subtotal,
    discountAmount: medicao.discountAmount,
    additionAmount: medicao.additionAmount,
    taxAmount: medicao.taxAmount,
    totalAmount: medicao.totalAmount,
  });
  const [laborCount, setLaborCount] = useState(medicao.laborItems.length);
  const [equipmentCount, setEquipmentCount] = useState(medicao.equipmentItems.length);
  const { searchParams, setParams } = useUrlState();
  const aba = searchParams.get("aba") ?? "mao-de-obra";

  return (
    <div className="space-y-4">
      <ResumoFinanceiro totals={totals} />
      <Tabs value={aba} onValueChange={(v) => setParams({ aba: v === "mao-de-obra" ? null : v })}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="mao-de-obra">
            Mão de Obra{" "}
            <Badge variant="secondary" className="ml-1 tabular">
              {laborCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="equipamentos">
            Equipamentos{" "}
            <Badge variant="secondary" className="ml-1 tabular">
              {equipmentCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="dados">Dados e ajustes</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="mao-de-obra" className="mt-3">
          <ItensGrid
            medicaoId={medicao.id}
            kind="mao-de-obra"
            items={medicao.laborItems}
            editable={editable}
            onTotals={setTotals}
            onCountChange={setLaborCount}
          />
        </TabsContent>
        <TabsContent value="equipamentos" className="mt-3">
          <ItensGrid
            medicaoId={medicao.id}
            kind="equipamentos"
            items={medicao.equipmentItems}
            editable={editable}
            onTotals={setTotals}
            onCountChange={setEquipmentCount}
          />
        </TabsContent>
        <TabsContent value="dados" className="mt-3">
          {editable ? (
            <CabecalhoForm medicao={medicao} contratos={contratos} onTotals={setTotals} />
          ) : (
            <DadosSomenteLeitura medicao={medicao} />
          )}
        </TabsContent>
        <TabsContent value="historico" className="mt-3">
          <Timeline entries={timeline} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DadosSomenteLeitura({ medicao }: { medicao: MeasurementDto }) {
  const campos: Array<[string, string]> = [
    ["Contrato", `${medicao.contract.code} · ${medicao.contract.name}`],
    ["Unidade", medicao.contract.unit],
    ["FRS", medicao.frs ?? "—"],
    ["Pedido de Compra", medicao.purchaseOrder ?? "—"],
    ["Responsável", medicao.owner.name],
    ["Observações", medicao.notes ?? "—"],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-3 rounded-md border bg-card p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {campos.map(([k, v]) => (
        <div key={k} className={k === "Observações" ? "sm:col-span-2 lg:col-span-3" : undefined}>
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="whitespace-pre-line">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
