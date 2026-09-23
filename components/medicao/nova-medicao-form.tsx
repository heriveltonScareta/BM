"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
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
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/components/estados";
import {
  createMeasurementSchema,
  type CreateMeasurementData,
  type CreateMeasurementInput,
} from "@/lib/validation/measurement";
import { api, ApiClientError } from "@/lib/api/client";
import { applyApiErrors } from "@/lib/api/form-errors";
import { currentCompetence, formatCompetence } from "@/lib/utils/dates";

interface ClienteSelecao {
  id: string;
  code: string;
  tradeName: string;
  contracts: Array<{ id: string; code: string; name: string; unit: string }>;
  contacts: Array<{ id: string; name: string; email: string }>;
}

function periodoDaCompetencia(competence: string): { startDate: string; endDate: string } {
  const [y, m] = competence.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { startDate: `${y}-${mm}-01`, endDate: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

export function NovaMedicaoForm() {
  const router = useRouter();
  const [clientes, setClientes] = useState<ClienteSelecao[] | null>(null);
  const [erroCarga, setErroCarga] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const competenciaInicial = currentCompetence();
  const periodo = periodoDaCompetencia(competenciaInicial);

  const form = useForm<CreateMeasurementInput, undefined, CreateMeasurementData>({
    resolver: zodResolver(createMeasurementSchema),
    defaultValues: {
      clientId: "",
      contractId: "",
      competence: formatCompetence(competenciaInicial),
      startDate: periodo.startDate,
      endDate: periodo.endDate,
      issueDate: periodo.endDate,
      frs: "",
      purchaseOrder: "",
      notes: "",
    },
  });

  const clientId = useWatch({ control: form.control, name: "clientId" });
  const cliente = clientes?.find((c) => c.id === clientId);

  // Carga dos clientes: setState apenas nos callbacks da promessa (nunca sincrono no efeito).
  useEffect(() => {
    let cancelado = false;
    api<ClienteSelecao[]>("/api/clientes/selecao")
      .then((data) => {
        if (cancelado) return;
        setClientes(data);
        setErroCarga(false);
      })
      .catch(() => {
        if (!cancelado) setErroCarga(true);
      });
    return () => {
      cancelado = true;
    };
  }, [tentativa]);

  function tentarNovamente() {
    setErroCarga(false);
    setClientes(null);
    setTentativa((n) => n + 1);
  }

  async function onSubmit(values: CreateMeasurementData) {
    try {
      const m = await api<{ id: string; number: string }>("/api/medicoes", {
        method: "POST",
        json: values,
      });
      toast.success(`Medição ${m.number} criada.`);
      // push para pagina dinamica ja carrega dados frescos; um refresh extra remontaria o workspace
      router.push(`/medicoes/${m.id}`);
    } catch (e) {
      if (e instanceof ApiClientError) {
        applyApiErrors(e, form.setError);
        toast.error(e.message);
      } else toast.error("Não foi possível criar a medição.");
    }
  }

  if (erroCarga)
    return <EstadoErro titulo="Não foi possível carregar os clientes" onRetry={tentarNovamente} />;
  if (clientes === null) return <EstadoCarregando linhas={4} />;
  if (clientes.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhum cliente ativo com contrato"
        descricao="Cadastre um cliente ativo com ao menos um contrato ativo para criar medições."
        acao={{ label: "Ir para Clientes", href: "/clientes" }}
      />
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Cliente e contrato</CardTitle>
            <CardDescription>Somente clientes e contratos ativos aparecem aqui.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      const c = clientes.find((x) => x.id === v);
                      form.setValue(
                        "contractId",
                        c?.contracts.length === 1 ? c.contracts[0]!.id : "",
                        { shouldValidate: false },
                      );
                    }}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full" aria-label="Cliente">
                        <SelectValue placeholder="Selecione o cliente" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clientes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.tradeName} ({c.code})
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
              name="contractId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contrato</FormLabel>
                  {/* key por cliente: o select remonta ja com os contratos certos e o valor pre-selecionado
                      (sem isso o Radix limpa o valor ao nao encontrar o item ainda nao montado) */}
                  <Select
                    key={clientId || "sem-cliente"}
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={!cliente}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full" aria-label="Contrato">
                        <SelectValue
                          placeholder={
                            cliente ? "Selecione o contrato" : "Escolha o cliente primeiro"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(cliente?.contracts ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.code} · {c.name} — {c.unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {cliente && cliente.contracts.length === 0 ? (
                    <FormDescription className="text-status-amber">
                      Este cliente não tem contrato ativo.
                    </FormDescription>
                  ) : null}
                  {cliente && cliente.contacts.length === 0 ? (
                    <FormDescription className="text-status-amber">
                      Sem aprovador cadastrado: será necessário antes do envio.
                    </FormDescription>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Competência e período</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FormField
              control={form.control}
              name="competence"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Competência</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="MM/AAAA"
                      inputMode="numeric"
                      onBlur={(e) => {
                        field.onBlur();
                        const m = /^(0[1-9]|1[0-2])\/(\d{4})$/.exec(e.target.value.trim());
                        if (m) {
                          const p = periodoDaCompetencia(`${m[2]}-${m[1]}`);
                          form.setValue("startDate", p.startDate);
                          form.setValue("endDate", p.endDate);
                          form.setValue("issueDate", p.endDate);
                        }
                      }}
                    />
                  </FormControl>
                  <FormDescription>Ajusta o período automaticamente.</FormDescription>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Informações comerciais</CardTitle>
            <CardDescription>FRS e Pedido de Compra podem ser preenchidos depois.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
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

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Criar medição
          </Button>
        </div>
      </form>
    </Form>
  );
}
