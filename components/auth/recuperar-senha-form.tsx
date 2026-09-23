"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { requestPasswordResetSchema } from "@/lib/validation/auth";
import { api, ApiClientError } from "@/lib/api/client";

type Values = z.infer<typeof requestPasswordResetSchema>;

export function RecuperarSenhaForm() {
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(requestPasswordResetSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: Values) {
    setErro(null);
    try {
      await api("/api/auth/recuperar-senha", { method: "POST", json: values });
      setEnviado(true);
    } catch (e) {
      setErro(
        e instanceof ApiClientError ? e.message : "Não foi possível enviar. Tente novamente.",
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar senha</CardTitle>
        <CardDescription>
          Informe seu e-mail. Se ele estiver cadastrado, enviaremos um link para criar uma nova
          senha.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {enviado ? (
          <div className="space-y-4 text-sm">
            <p role="status">
              Se o e-mail estiver cadastrado, você receberá o link em instantes. Verifique também a
              caixa de spam.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">Voltar para o login</Link>
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" autoFocus {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {erro ? (
                <p role="alert" className="text-sm text-status-red">
                  {erro}
                </p>
              ) : null}
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : null}
                Enviar link
              </Button>
              <p className="text-center text-sm">
                <Link href="/login" className="text-primary underline-offset-4 hover:underline">
                  Voltar para o login
                </Link>
              </p>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}
