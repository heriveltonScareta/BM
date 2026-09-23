"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Table as TableIcon, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EstadoVazio } from "@/components/estados";
import type { StatusTone } from "@/lib/services/status-machine";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

export interface BarraDado {
  chave: string;
  label: string;
  /** Valor monetario (string decimal). */
  valor: string;
  quantidade: number;
  /** Cor semantica (so para graficos de status). Sem tone: cor unica de magnitude. */
  tone?: StatusTone;
}

interface Props {
  titulo: string;
  descricao?: string;
  dados: BarraDado[];
  /** Qual medida e desenhada. A tabela sempre mostra as duas (quando `mostrarValor`). */
  medida: "valor" | "quantidade";
  /** Barras horizontais (categorias longas) ou verticais (series temporais). */
  orientacao?: "horizontal" | "vertical";
  /** Oculta a coluna de valores na tabela (perfil sem acesso ao financeiro consolidado). */
  mostrarValor?: boolean;
  className?: string;
  vazio?: string;
}

const TONE_VAR: Record<StatusTone, string> = {
  gray: "var(--status-gray)",
  amber: "var(--status-amber)",
  blue: "var(--status-blue)",
  green: "var(--status-green)",
  red: "var(--status-red)",
};

const compact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

function eixo(medida: Props["medida"], v: number): string {
  return medida === "valor" ? compact.format(v) : String(v);
}

function rotulo(medida: Props["medida"], v: number): string {
  return medida === "valor" ? formatCurrency(v) : String(v);
}

/**
 * Grafico de barras unico do sistema (uma medida, uma serie).
 * Magnitude usa uma so cor; status usa a cor semantica com o nome sempre visivel no eixo.
 * Toda visualizacao tem tooltip e uma tabela equivalente (acessibilidade e conferencia).
 */
export function GraficoBarras({
  titulo,
  descricao,
  dados,
  medida,
  orientacao = "vertical",
  mostrarValor = true,
  className,
  vazio = "Sem dados para o período.",
}: Props) {
  const [tabela, setTabela] = React.useState(false);
  const serie = dados.map((d) => ({
    ...d,
    y: medida === "valor" ? Number(d.valor) : d.quantidade,
  }));
  const horizontal = orientacao === "horizontal";
  const altura = horizontal ? Math.max(160, 28 * serie.length + 40) : 240;
  const idTitulo = React.useId();

  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle id={idTitulo}>{titulo}</CardTitle>
          {descricao ? <CardDescription>{descricao}</CardDescription> : null}
        </div>
        {serie.length ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={tabela}
            onClick={() => setTabela((v) => !v)}
          >
            {tabela ? <BarChart3 aria-hidden /> : <TableIcon aria-hidden />}
            {tabela ? "Gráfico" : "Tabela"}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {serie.length === 0 ? (
          <EstadoVazio titulo={vazio} className="py-8" />
        ) : tabela ? (
          <Table className="text-sm" aria-labelledby={idTitulo}>
            <TableHeader>
              <TableRow>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                {mostrarValor ? <TableHead className="text-right">Valor</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {serie.map((d) => (
                <TableRow key={d.chave}>
                  <TableCell>{d.label}</TableCell>
                  <TableCell className="text-right tabular">{d.quantidade}</TableCell>
                  {mostrarValor ? (
                    <TableCell className="text-right tabular">{formatCurrency(d.valor)}</TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <figure aria-labelledby={idTitulo} style={{ height: altura }} className="w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={serie}
                layout={horizontal ? "vertical" : "horizontal"}
                margin={{ top: 16, right: horizontal ? 72 : 8, bottom: 0, left: 0 }}
                barCategoryGap={horizontal ? 6 : "25%"}
              >
                <CartesianGrid
                  stroke="var(--border)"
                  strokeDasharray="2 4"
                  horizontal={!horizontal}
                  vertical={horizontal}
                />
                {horizontal ? (
                  <>
                    <XAxis type="number" hide domain={[0, (max: number) => max * 1.05]} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={150}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                      interval={0}
                    />
                  </>
                ) : (
                  <>
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                      interval={0}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={64}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                      tickFormatter={(v: number) => eixo(medida, v)}
                    />
                  </>
                )}
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                  content={({ active, payload }) => {
                    const d = payload?.[0]?.payload as (typeof serie)[number] | undefined;
                    if (!active || !d) return null;
                    return (
                      <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                        <div className="font-medium">{d.label}</div>
                        <div className="tabular text-muted-foreground">
                          {d.quantidade} {d.quantidade === 1 ? "medição" : "medições"}
                        </div>
                        {mostrarValor ? (
                          <div className="tabular">{formatCurrency(d.valor)}</div>
                        ) : null}
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="y"
                  name={medida === "valor" ? "Valor" : "Quantidade"}
                  fill="var(--chart-1)"
                  radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                  maxBarSize={horizontal ? 20 : 48}
                  isAnimationActive={false}
                >
                  {serie.map((d) => (
                    <Cell key={d.chave} fill={d.tone ? TONE_VAR[d.tone] : "var(--chart-1)"} />
                  ))}
                  <LabelList
                    dataKey="y"
                    position={horizontal ? "right" : "top"}
                    formatter={(v: unknown) => rotulo(medida, Number(v))}
                    fill="var(--foreground)"
                    fontSize={11}
                    className="tabular"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </figure>
        )}
      </CardContent>
    </Card>
  );
}
