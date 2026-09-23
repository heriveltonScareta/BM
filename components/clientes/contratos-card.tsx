"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { EstadoVazio } from "@/components/estados";
import { contractSchema, type ContractData, type ContractInput } from "@/lib/validation/client";
import { api, ApiClientError } from "@/lib/api/client";
import { applyApiErrors } from "@/lib/api/form-errors";
import { formatDate } from "@/lib/utils/dates";

export interface ContratoRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  /** AAAA-MM-DD */
  startDate: string;
  endDate: string | null;
  isActive: boolean;
}

export function ContratosCard({
  clienteId,
  contratos,
  podeEditar,
}: {
  clienteId: string;
  contratos: ContratoRow[];
  podeEditar: boolean;
}) {
  const [editando, setEditando] = useState<ContratoRow | "novo" | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>Contratos</CardTitle>
          <CardDescription>
            Vínculos comerciais por unidade. Cada medição pertence a um contrato ativo.
          </CardDescription>
        </div>
        {podeEditar ? (
          <Button size="sm" onClick={() => setEditando("novo")}>
            <Plus aria-hidden /> Adicionar
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {contratos.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum contrato"
            descricao="Cadastre um contrato para poder criar medições para este cliente."
            acao={
              podeEditar
                ? { label: "Adicionar contrato", onClick: () => setEditando("novo") }
                : undefined
            }
            className="py-8"
          />
        ) : (
          <ul className="divide-y">
            {contratos.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{c.code}</span>
                    <span className="font-medium">{c.name}</span>
                    {!c.isActive ? <Badge variant="secondary">Inativo</Badge> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.unit} · {formatDate(c.startDate)}
                    {c.endDate ? ` a ${formatDate(c.endDate)}` : " (sem término)"}
                  </div>
                </div>
                {podeEditar ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Editar contrato ${c.code}`}
                    onClick={() => setEditando(c)}
                  >
                    <Pencil aria-hidden />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {editando ? (
        <ContratoDialog
          clienteId={clienteId}
          contrato={editando === "novo" ? null : editando}
          onClose={() => setEditando(null)}
        />
      ) : null}
    </Card>
  );
}

function ContratoDialog({
  clienteId,
  contrato,
  onClose,
}: {
  clienteId: string;
  contrato: ContratoRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const form = useForm<ContractInput, undefined, ContractData>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      code: contrato?.code ?? "",
      name: contrato?.name ?? "",
      unit: contrato?.unit ?? "",
      startDate: contrato?.startDate ?? "",
      endDate: contrato?.endDate ?? "",
      isActive: contrato?.isActive ?? true,
    },
  });

  async function onSubmit(values: ContractData) {
    try {
      if (contrato) {
        await api(`/api/clientes/${clienteId}/contratos/${contrato.id}`, {
          method: "PATCH",
          json: values,
        });
        toast.success("Contrato atualizado.");
      } else {
        await api(`/api/clientes/${clienteId}/contratos`, { method: "POST", json: values });
        toast.success("Contrato adicionado.");
      }
      router.refresh();
      onClose();
    } catch (e) {
      if (e instanceof ApiClientError) {
        applyApiErrors(e, form.setError, { code: /código/i });
        toast.error(e.message);
      } else toast.error("Não foi possível salvar o contrato.");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{contrato ? "Editar contrato" : "Novo contrato"}</DialogTitle>
          <DialogDescription>
            Contratos inativos não aparecem ao criar novas medições.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid gap-4 sm:grid-cols-2"
            noValidate
          >
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código</FormLabel>
                  <FormControl>
                    <Input {...field} autoFocus className="uppercase" maxLength={40} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="unit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unidade</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={120} placeholder="Ex.: Mina Serra Azul" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Objeto do contrato</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={160} />
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
                  <FormLabel>Início</FormLabel>
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
                  <FormLabel>Término (opcional)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 sm:col-span-2">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(v) => field.onChange(v === true)}
                    />
                  </FormControl>
                  <FormLabel className="font-normal">Contrato ativo</FormLabel>
                </FormItem>
              )}
            />
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : null}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
