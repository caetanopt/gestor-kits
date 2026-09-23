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
  // Como no convite: um filete por cima, as duas contagens separadas por
  // outro, números em Rubik e rótulos em versaletes dourados.
  return (
    <div className="border-dourado-100 border-t pt-4">
      <p className="text-ink-700 text-center text-sm">{company.name}</p>

      <dl className="mt-2 grid grid-cols-2 text-center">
        <div className="border-dourado-100 border-e">
          <dd className="text-ink-900 font-display text-3xl tabular-nums">
            {totals.delivered}
          </dd>
          <dt className="text-dourado-700 mt-0.5 text-xs font-medium tracking-[0.08em] uppercase">
            entregues
          </dt>
        </div>
        <div>
          <dd className="text-ink-900 font-display text-3xl tabular-nums">
            {totals.employees}
          </dd>
          <dt className="text-dourado-700 mt-0.5 text-xs font-medium tracking-[0.08em] uppercase">
            colaboradores
          </dt>
        </div>
      </dl>
    </div>
  );
}
