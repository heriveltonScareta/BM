import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EstadoSemPermissao } from "@/components/estados";
import { can } from "@/lib/auth/rbac";
import { requireSession } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { formatCnpj } from "@/lib/validation/cnpj";

export const metadata: Metadata = { title: "Configurações" };

export default async function Page() {
  const user = await requireSession();
  if (!can(user, "configuracoes:ver")) return <EstadoSemPermissao />;
  const campos: Array<[string, string]> = [
    ["Razão social", config.company.name],
    ["CNPJ", formatCnpj(config.company.cnpj)],
    ["E-mail", config.company.email],
    ["Fuso horário", config.timezone],
    ["Armazenamento", config.storage.provider === "s3" ? "S3" : "Local (./storage)"],
    ["E-mail (provedor)", config.email.provider === "smtp" ? "SMTP" : "Desenvolvimento (arquivos)"],
  ];
  return (
    <>
      <PageHeader
        titulo="Configurações"
        descricao="Dados da prestadora e parâmetros do ambiente (definidos nas variáveis de ambiente)."
      />
      <Card>
        <CardHeader>
          <CardTitle>Dados da prestadora</CardTitle>
          <CardDescription>
            Aparecem no cabeçalho do boletim em PDF e nos relatórios. Para alterar, edite as
            variáveis <code className="font-mono text-xs">COMPANY_*</code> no arquivo{" "}
            <code className="font-mono text-xs">.env</code> e reinicie a aplicação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {campos.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className={label === "CNPJ" ? "tabular" : undefined}>{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </>
  );
}
