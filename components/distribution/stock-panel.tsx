import type { CompanySummary, Stock } from "@/lib/validation/delivery";

/** Resumo do stock da empresa, legível a alguma distância do ecrã. */
export function StockPanel({
  company,
  stock,
}: {
  company: CompanySummary;
  stock: Stock;
}) {
  const exhausted = stock.available === 0;

  return (
    <div className="bg-ink-50 ring-ink-200 rounded-xl p-4 ring-1">
      <p className="text-ink-700 text-sm font-medium">{company.name}</p>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <dd className="text-ink-900 text-2xl font-semibold tabular-nums">
            {stock.allocated}
          </dd>
          <dt className="text-ink-500 text-xs">atribuídos</dt>
        </div>
        <div>
          <dd className="text-ink-900 text-2xl font-semibold tabular-nums">
            {stock.delivered}
          </dd>
          <dt className="text-ink-500 text-xs">entregues</dt>
        </div>
        <div>
          <dd
            className={`text-2xl font-semibold tabular-nums ${
              exhausted ? "text-blocked" : "text-delivered"
            }`}
          >
            {stock.available}
          </dd>
          <dt className="text-ink-500 text-xs">disponíveis</dt>
        </div>
      </dl>
    </div>
  );
}
