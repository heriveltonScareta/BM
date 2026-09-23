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
import { Textarea } from "@/components/ui/textarea";
import { clientSchema, type ClientData, type ClientInput } from "@/lib/validation/client";
import { maskCnpj } from "@/lib/validation/cnpj";
import { api, ApiClientError } from "@/lib/api/client";
import { applyApiErrors } from "@/lib/api/form-errors";

interface ClienteFormProps {
  /** Quando informado, o formulario edita o cliente existente. */
  cliente?: {
    id: string;
    code: string;
    tradeName: string;
    legalName: string;
    cnpj: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    notes: string | null;
  };
}

export function ClienteForm({ cliente }: ClienteFormProps) {
  const router = useRouter();
  const form = useForm<ClientInput, undefined, ClientData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      code: cliente?.code ?? "",
      tradeName: cliente?.tradeName ?? "",
      legalName: cliente?.legalName ?? "",
      cnpj: cliente ? maskCnpj(cliente.cnpj) : "",
      email: cliente?.email ?? "",
      phone: cliente?.phone ?? "",
      address: cliente?.address ?? "",
      notes: cliente?.notes ?? "",
    },
  });

  async function onSubmit(values: ClientData) {
    try {
      const saved = cliente
        ? await api<{ id: string }>(`/api/clientes/${cliente.id}`, {
            method: "PATCH",
            json: values,
          })
        : await api<{ id: string }>("/api/clientes", { method: "POST", json: values });
      toast.success(cliente ? "Cliente atualizado." : "Cliente cadastrado.");
      router.push(`/clientes/${saved.id}`);
      router.refresh();
    } catch (e) {
      if (e instanceof ApiClientError) {
        applyApiErrors(e, form.setError, { cnpj: /CNPJ/i, code: /código/i });
        toast.error(e.message);
      } else {
        toast.error("Não foi possível salvar. Tente novamente.");
      }
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Identificação</CardTitle>
            <CardDescription>
              Dados cadastrais do cliente. O código identifica o cliente no sistema.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código</FormLabel>
                  <FormControl>
                    <Input {...field} className="uppercase" maxLength={20} autoFocus={!cliente} />
                  </FormControl>
                  <FormDescription>Ex.: MSA, CVF.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="cnpj"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CNPJ</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      inputMode="numeric"
                      placeholder="00.000.000/0000-00"
                      onChange={(e) => field.onChange(maskCnpj(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tradeName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome fantasia</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={120} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="legalName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Razão social</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={160} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contato e endereço</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} maxLength={30} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Endereço</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} maxLength={240} />
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
                    <Textarea {...field} value={field.value ?? ""} rows={3} maxLength={2000} />
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
            {cliente ? "Salvar alterações" : "Cadastrar cliente"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
