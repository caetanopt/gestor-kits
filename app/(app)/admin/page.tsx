import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { listCompanyStock } from "@/server/use-cases/companies";

export const metadata: Metadata = { title: "Dashboard · Kits" };

// O dashboard reflete entregas a decorrer; não deve ser servido de cache.
export const dynamic = "force-dynamic";

function percent(delivered: number, allocated: number): number {
  return allocated === 0 ? 0 : Math.round((delivered / allocated) * 100);
}

export default async function AdminPage() {
  await requireAdmin();
  const companies = await listCompanyStock();

  const totals = companies.reduce(
    (acc, company) => ({
      allocated: acc.allocated + company.allocated,
      delivered: acc.delivered + company.delivered,
      available: acc.available + company.available,
      employees: acc.employees + company.employeeCount,
    }),
    { allocated: 0, delivered: 0, available: 0, employees: 0 },
  );

  return (
    <div className="space-y-6">
      <h1 className="text-ink-900 text-xl font-semibold">Dashboard</h1>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Kits atribuídos" value={totals.allocated} />
        <Stat label="Kits entregues" value={totals.delivered} tone="delivered" />
        <Stat
          label="Kits disponíveis"
          value={totals.available}
          tone={totals.available === 0 ? "blocked" : undefined}
        />
        <Stat label="Colaboradores" value={totals.employees} />
      </dl>

      {companies.length === 0 ? (
        <div className="ring-ink-200 rounded-2xl bg-white p-8 text-center ring-1">
          <p className="text-ink-700 text-sm">Ainda não existem empresas.</p>
          <Link
            href="/admin/empresas"
            className="text-azul-900 mt-3 inline-block text-sm font-medium underline"
          >
            Criar a primeira empresa
          </Link>
        </div>
      ) : (
        <div className="ring-ink-200 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1">
          <table className="w-full text-sm">
            <caption className="text-ink-700 px-4 py-3 text-left font-medium">
              Distribuição por empresa
            </caption>
            <thead>
              <tr className="border-ink-200 text-ink-700 border-y text-left">
                <th scope="col" className="px-4 py-2 font-medium">
                  Empresa
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Atribuídos
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Entregues
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Disponíveis
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  % entregue
                </th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => {
                const pct = percent(company.delivered, company.allocated);
                return (
                  <tr key={company.id} className="border-ink-100 border-b last:border-0">
                    <td className="text-ink-900 px-4 py-2.5 font-medium">
                      {company.name}
                      <span className="text-ink-700 ms-2 text-xs font-normal">
                        {company.code}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {company.allocated}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {company.delivered}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Disponiveis value={company.available} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div
                          className="bg-ink-200 h-1.5 w-16 overflow-hidden rounded-full"
                          aria-hidden="true"
                        >
                          <div
                            className="bg-eco-500 h-full rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-ink-700 w-10 tabular-nums">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-ink-200 border-t font-semibold">
                <th scope="row" className="px-4 py-2.5 text-left">
                  Total
                </th>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {totals.allocated}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {totals.delivered}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {totals.available}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {percent(totals.delivered, totals.allocated)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "delivered" | "blocked";
}) {
  // A cor identifica a métrica através de uma barra, não do número: sobre
  // branco, as cores secundárias da marca não têm contraste para texto.
  const bar =
    tone === "delivered"
      ? "bg-eco-500"
      : tone === "blocked"
        ? "bg-laranja-500"
        : "bg-ink-300";

  return (
    <div className="ring-ink-200 overflow-hidden rounded-2xl bg-white shadow-sm ring-1">
      <div aria-hidden="true" className={`h-1.5 ${bar}`} />
      <div className="p-4">
        <dd className="text-ink-900 text-3xl font-semibold tabular-nums">{value}</dd>
        <dt className="text-ink-700 mt-1 text-xs">{label}</dt>
      </div>
    </div>
  );
}

/**
 * Número de kits disponíveis.
 *
 * A zero, ganha fundo laranja com texto antracite (6.1:1) em vez de texto
 * colorido: é mais visível numa tabela e legível, ao contrário de laranja
 * sobre branco.
 */
function Disponiveis({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="bg-laranja-500 text-ink-800 inline-block rounded-md px-2.5 py-1 font-bold tabular-nums">
        0<span className="sr-only"> — esgotado</span>
      </span>
    );
  }
  return <span className="text-ink-900 font-semibold tabular-nums">{value}</span>;
}
