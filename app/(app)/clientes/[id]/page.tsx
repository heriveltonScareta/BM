import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EstadoSemPermissao } from "@/components/estados";
import { AtivoBadge } from "@/components/clientes/clientes-tabela";
import { ClienteAcoes } from "@/components/clientes/cliente-acoes";
import { ContatosCard } from "@/components/clientes/contatos-card";
import { ContratosCard } from "@/components/clientes/contratos-card";
import { MedicoesResumoCard } from "@/components/clientes/medicoes-resumo-card";
import { can, getScope, requireSession } from "@/lib/auth/session";
import { getClient } from "@/lib/services/client.service";
import { getClientSummary } from "@/lib/services/report.service";
import { NotFoundError } from "@/lib/errors";
import { formatCnpj } from "@/lib/validation/cnpj";
import { dateToDateOnly, formatDateTime } from "@/lib/utils/dates";
import { idSchema } from "@/lib/validation/common";

export const metadata: Metadata = { title: "Cliente" };

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession();
  if (!can(user, "clientes:ver")) return <EstadoSemPermissao />;
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  let cliente;
  try {
    cliente = await getClient(getScope(user), id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const podeEditar = can(user, "clientes:gerenciar");
  const resumo = can(user, "medicao:ver") ? await getClientSummary(getScope(user), id) : null;

  const campos: Array<[string, string | null]> = [
    ["Razão social", cliente.legalName],
    ["CNPJ", formatCnpj(cliente.cnpj)],
    ["E-mail", cliente.email],
    ["Telefone", cliente.phone],
    ["Endereço", cliente.address],
    ["Cadastrado em", formatDateTime(cliente.createdAt)],
  ];

  return (
    <>
      <PageHeader
        titulo={cliente.tradeName}
        descricao={`${cliente.code} · ${cliente.legalName}`}
        acoes={
          <>
            <AtivoBadge ativo={cliente.isActive} />
            {podeEditar ? (
              <ClienteAcoes
                id={cliente.id}
                isActive={cliente.isActive}
                temMedicoes={cliente._count.measurements > 0}
              />
            ) : null}
          </>
        }
      />
      <Card>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {campos.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className={label === "CNPJ" ? "tabular" : undefined}>{value || "—"}</dd>
              </div>
            ))}
            {cliente.notes ? (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-xs text-muted-foreground">Observações</dt>
                <dd className="whitespace-pre-line">{cliente.notes}</dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>
      {resumo ? (
        <MedicoesResumoCard
          clienteId={cliente.id}
          resumo={resumo}
          mostrarValores={can(user, "relatorios:financeiro")}
        />
      ) : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <ContatosCard clienteId={cliente.id} contatos={cliente.contacts} podeEditar={podeEditar} />
        <ContratosCard
          clienteId={cliente.id}
          podeEditar={podeEditar}
          contratos={cliente.contracts.map((c) => ({
            id: c.id,
            code: c.code,
            name: c.name,
            unit: c.unit,
            startDate: dateToDateOnly(c.startDate),
            endDate: c.endDate ? dateToDateOnly(c.endDate) : null,
            isActive: c.isActive,
          }))}
        />
      </div>
    </>
  );
}
