import type { CompanySummary, Totals } from "@/lib/validation/delivery";

/**
 * O que a empresa já entregou, legível a alguma distância do ecrã.
 *
 * Já não há kits atribuídos nem disponíveis: entrega-se sempre. Ficam as duas
 * contagens que dizem alguma coisa ao operador — quantos kits saíram e quantos
 * colaboradores a empresa tem.
 */
export function TotalsPanel({
  company,
  totals,
}: {
  company: CompanySummary;
  totals: Totals;
}) {
  return (
    <div className="bg-ink-50 ring-ink-200 rounded-xl p-4 ring-1">
      <p className="text-ink-700 text-sm font-medium">{company.name}</p>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
        <div>
          <dd className="text-ink-900 text-2xl font-semibold tabular-nums">
            {totals.delivered}
          </dd>
          <dt className="text-ink-700 text-xs">entregues</dt>
        </div>
        <div>
          <dd className="text-ink-900 text-2xl font-semibold tabular-nums">
            {totals.employees}
          </dd>
          <dt className="text-ink-700 text-xs">colaboradores</dt>
        </div>
      </dl>
    </div>
  );
}
