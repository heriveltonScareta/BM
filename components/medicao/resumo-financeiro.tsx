import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import type { MeasurementTotals } from "@/lib/services/measurement.service";
import { cn } from "@/lib/utils";

export function ResumoFinanceiro({
  totals,
  className,
}: {
  totals: MeasurementTotals;
  className?: string;
}) {
  const linhas: Array<[string, string, string?]> = [
    ["Mão de obra", totals.laborTotal],
    ["Equipamentos", totals.equipmentTotal],
    ["Outros", totals.otherAmount],
    ["Subtotal", totals.subtotal, "font-medium"],
    ["Descontos", totals.discountAmount, "text-status-red"],
    ["Acréscimos", totals.additionAmount],
    ["Impostos", totals.taxAmount],
  ];
  return (
    <Card className={cn("py-4", className)}>
      <CardContent className="px-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4 xl:grid-cols-8">
          {linhas.map(([label, value, cls]) => (
            <div key={label} className="min-w-0">
              <dt className="truncate text-xs text-muted-foreground">{label}</dt>
              <dd className={cn("tabular", cls)}>
                {label === "Descontos" && Number(value) > 0
                  ? `− ${formatCurrency(value)}`
                  : formatCurrency(value)}
              </dd>
            </div>
          ))}
          <div className="col-span-2 rounded-md bg-primary/5 px-2 py-1 sm:col-span-4 xl:col-span-1">
            <dt className="text-xs font-medium text-primary">Total da medição</dt>
            <dd className="tabular text-base font-semibold" data-testid="total-medicao">
              {formatCurrency(totals.totalAmount)}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
