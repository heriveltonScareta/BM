"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  measurementHeaderSchema,
  type MeasurementHeaderData,
  type MeasurementHeaderInput,
} from "@/lib/validation/measurement";
import type { MeasurementDto } from "@/lib/services/measurement-dto";
import type { MeasurementTotals } from "@/lib/services/measurement.service";
import { api, ApiClientError } from "@/lib/api/client";
import { applyApiErrors } from "@/lib/api/form-errors";
import { formatCompetence } from "@/lib/utils/dates";
import { toInputNumber } from "@/lib/utils/numbers";

export interface ContratoOpcao {
  id: string;
  code: string;
  name: string;
  unit: string;
}

export function CabecalhoForm({
  medicao,
  contratos,
  onTotals,
}: {
  medicao: MeasurementDto;
  contratos: ContratoOpcao[];
  onTotals: (t: MeasurementTotals) => void;
}) {
  const router = useRouter();
  const form = useForm<MeasurementHeaderInput, undefined, MeasurementHeaderData>({
    resolver: zodResolver(measurementHeaderSchema),
    defaultValues: {
      contractId: medicao.contract.id,
      competence: formatCompetence(medicao.competence),
      startDate: medicao.startDate,
      endDate: medicao.endDate,
      issueDate: medicao.issueDate,
      frs: medicao.frs ?? "",
      purchaseOrder: medicao.purchaseOrder ?? "",
      notes: medicao.notes ?? "",
      otherAmount: toInputNumber(medicao.otherAmount, 2),
      discountAmount: toInputNumber(medicao.discountAmount, 2),
      additionAmount: toInputNumber(medicao.additionAmount, 2),
      taxAmount: toInputNumber(medicao.taxAmount, 2),
    },
  });

  async function onSubmit(values: MeasurementHeaderData) {
    try {
      const res = await api<{ totals: MeasurementTotals }>(`/api/medicoes/${medicao.id}`, {
        method: "PATCH",
        json: values,
      });
      onTotals(res.totals);
      toast.success("Dados da medição salvos.");
      form.reset(form.getValues());
      router.refresh();
    } catch (e) {
      if (e instanceof ApiClientError) {
        applyApiErrors(e, form.setError);
        toast.error(e.message);
      } else toast.error("Não foi possível salvar.");
    }
  }

  const money = (
    name: "otherAmount" | "discountAmount" | "additionAmount" | "taxAmount",
    label: string,
    desc?: string,
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={String(field.value ?? "")}
              inputMode="decimal"
              className="tabular text-right"
              placeholder="0,00"
            />
          </FormControl>
          {desc ? <FormDescription>{desc}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Dados do boletim</CardTitle>
              <CardDescription>
                Cliente: {medicao.client.tradeName} (não pode ser alterado).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="contractId"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Contrato</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full" aria-label="Contrato">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {contratos.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.code} · {c.name} — {c.unit}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="competence"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Competência</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="MM/AAAA" inputMode="numeric" />
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
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Início do período</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fim do período</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="frs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>FRS</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} maxLength={40} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="purchaseOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pedido de Compra (PC)</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} maxLength={40} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Observações</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value ?? ""} rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ajustes do total</CardTitle>
              <CardDescription>
                Valores em reais. Total = Subtotal − Descontos + Acréscimos + Impostos.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {money("otherAmount", "Outros", "Somado ao subtotal.")}
              {money("discountAmount", "Descontos")}
              {money("additionAmount", "Acréscimos")}
              {money("taxAmount", "Impostos")}
            </CardContent>
          </Card>
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
            {form.formState.isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Salvar dados
          </Button>
        </div>
      </form>
    </Form>
  );
}
