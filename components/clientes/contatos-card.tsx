"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Plus, Trash2, UserCheck } from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { contactSchema, type ContactData, type ContactInput } from "@/lib/validation/client";
import { api, ApiClientError } from "@/lib/api/client";
import { applyApiErrors } from "@/lib/api/form-errors";

export interface ContatoRow {
  id: string;
  name: string;
  role: string | null;
  email: string;
  phone: string | null;
  isApprover: boolean;
  isActive: boolean;
}

export function ContatosCard({
  clienteId,
  contatos,
  podeEditar,
}: {
  clienteId: string;
  contatos: ContatoRow[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<ContatoRow | "novo" | null>(null);
  const [excluindo, setExcluindo] = useState<ContatoRow | null>(null);
  const [busy, setBusy] = useState(false);

  async function excluir() {
    if (!excluindo) return;
    setBusy(true);
    try {
      await api(`/api/clientes/${clienteId}/contatos/${excluindo.id}`, { method: "DELETE" });
      toast.success("Contato removido.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Não foi possível remover o contato.");
    } finally {
      setBusy(false);
      setExcluindo(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>Contatos</CardTitle>
          <CardDescription>
            Responsáveis do cliente. Aprovadores recebem os boletins para aprovação e assinatura.
          </CardDescription>
        </div>
        {podeEditar ? (
          <Button size="sm" onClick={() => setEditando("novo")}>
            <Plus aria-hidden /> Adicionar
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {contatos.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum contato"
            descricao="Cadastre ao menos um aprovador para poder enviar medições a este cliente."
            acao={
              podeEditar
                ? { label: "Adicionar contato", onClick: () => setEditando("novo") }
                : undefined
            }
            className="py-8"
          />
        ) : (
          <ul className="divide-y">
            {contatos.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        c.isActive
                          ? "font-medium"
                          : "font-medium text-muted-foreground line-through"
                      }
                    >
                      {c.name}
                    </span>
                    {c.isApprover ? (
                      <Badge
                        variant="outline"
                        className="border-status-blue/30 bg-status-blue-bg text-status-blue"
                      >
                        <UserCheck aria-hidden /> Aprovador
                      </Badge>
                    ) : null}
                    {!c.isActive ? <Badge variant="secondary">Inativo</Badge> : null}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[c.role, c.email, c.phone].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {podeEditar ? (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Editar ${c.name}`}
                      onClick={() => setEditando(c)}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remover ${c.name}`}
                      onClick={() => setExcluindo(c)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {editando ? (
        <ContatoDialog
          clienteId={clienteId}
          contato={editando === "novo" ? null : editando}
          onClose={() => setEditando(null)}
        />
      ) : null}

      <AlertDialog
        open={excluindo !== null}
        onOpenChange={(o) => !o && !busy && setExcluindo(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover contato?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluindo?.name} deixará de constar como contato deste cliente. O histórico de
              aprovações já registradas é mantido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void excluir();
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ContatoDialog({
  clienteId,
  contato,
  onClose,
}: {
  clienteId: string;
  contato: ContatoRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const form = useForm<ContactInput, undefined, ContactData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: contato?.name ?? "",
      role: contato?.role ?? "",
      email: contato?.email ?? "",
      phone: contato?.phone ?? "",
      isApprover: contato?.isApprover ?? false,
      isActive: contato?.isActive ?? true,
    },
  });

  async function onSubmit(values: ContactData) {
    try {
      if (contato) {
        await api(`/api/clientes/${clienteId}/contatos/${contato.id}`, {
          method: "PATCH",
          json: values,
        });
        toast.success("Contato atualizado.");
      } else {
        await api(`/api/clientes/${clienteId}/contatos`, { method: "POST", json: values });
        toast.success("Contato adicionado.");
      }
      router.refresh();
      onClose();
    } catch (e) {
      if (e instanceof ApiClientError) {
        applyApiErrors(e, form.setError);
        toast.error(e.message);
      } else toast.error("Não foi possível salvar o contato.");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{contato ? "Editar contato" : "Novo contato"}</DialogTitle>
          <DialogDescription>
            Marque como aprovador quem pode aprovar e assinar os boletins.
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
              name="name"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input {...field} autoFocus maxLength={120} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cargo</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} maxLength={80} />
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
              name="email"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isApprover"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(v) => field.onChange(v === true)}
                    />
                  </FormControl>
                  <FormLabel className="font-normal">Aprovador de medições</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(v) => field.onChange(v === true)}
                    />
                  </FormControl>
                  <FormLabel className="font-normal">Contato ativo</FormLabel>
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
