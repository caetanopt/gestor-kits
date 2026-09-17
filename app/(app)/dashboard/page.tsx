import type { Metadata } from "next";
import { ProgressLink } from "@/components/ui/route-progress";
import { requireUser } from "@/lib/auth/dal";
import { listCompanyTotals } from "@/server/use-cases/companies";
import { countDeliveriesLastHour } from "@/server/use-cases/deliveries";

export const metadata: Metadata = { title: "Dashboard · Kits" };

// O dashboard reflete entregas a decorrer; não deve ser servido de cache.
export const dynamic = "force-dynamic";

/** Percentagem de colaboradores que já levantaram o kit. */
function percent(delivered: number, employees: number): number {
  return employees === 0 ? 0 : Math.round((delivered / employees) * 100);
}

export default async function DashboardPage() {
  // Acessível a ambos os perfis. Vive fora de /admin de propósito: assim a
  // fronteira de permissões coincide com a estrutura do URL, e /admin pode
  // ser inteiramente administrativo.
  const user = await requireUser();
  const [companies, ultimaHora] = await Promise.all([
    listCompanyTotals(),
    countDeliveriesLastHour(),
  ]);

  const totals = companies.reduce(
    (acc, company) => ({
      delivered: acc.delivered + company.delivered,
      employees: acc.employees + company.employeeCount,
    }),
    { delivered: 0, employees: 0 },
  );

  return (
    <div className="space-y-6">
      <h1 className="text-ink-900 text-xl font-semibold">Dashboard</h1>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Kits entregues" value={totals.delivered} tone="entregue" />
        {/* O total diz onde se chegou; este diz se ainda está a acontecer. É o
            único número daqui sobre o qual dá para agir durante o evento. */}
        <Stat label="Na última hora" value={ultimaHora} tone="disponivel" />
        <Stat label="Colaboradores" value={totals.employees} />
        <Stat label="Empresas" value={companies.length} />
      </dl>

      {companies.length === 0 ? (
        <div className="ring-ink-200 rounded-2xl bg-white p-8 text-center ring-1">
          <p className="text-ink-700 text-sm">Ainda não existem empresas.</p>
          <ProgressLink
            href="/admin/empresas"
            className="text-azul-900 mt-3 inline-block text-sm font-medium underline"
          >
            Criar a primeira empresa
          </ProgressLink>
        </div>
      ) : (
        <div className="ring-ink-200 overflow-hidden rounded-2xl bg-white shadow-sm ring-1">
          {/* A exportação é só para administradores: o ficheiro leva nomes e
              emails de toda a gente, e um distribuidor não tem de os poder
              descarregar em bloco. */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <p className="text-ink-700 font-medium">Distribuição por empresa</p>
            {user.role === "admin" && totals.employees > 0 && (
              <ExportLink href="/api/colaboradores/exportar">
                Exportar lista (CSV)
              </ExportLink>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Kits entregues e colaboradores por empresa
              </caption>
              <thead>
                <tr className="border-ink-200 text-ink-700 border-y text-left">
                  <th scope="col" className="px-4 py-2 font-medium">
                    Empresa
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Entregues
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Colaboradores
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    % levantado
                  </th>
                  {user.role === "admin" && (
                    <th scope="col" className="px-4 py-2">
                      <span className="sr-only">Exportar</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => {
                  const pct = percent(company.delivered, company.employeeCount);
                  return (
                    <tr
                      key={company.id}
                      className="border-ink-100 border-b last:border-0"
                    >
                      <td className="text-ink-900 px-4 py-2.5 font-medium">
                        {/* O código só interessa a quem prepara ficheiros de
                          importação, e esses vivem na página Empresas. Aqui é
                          ruído. */}
                        {company.name}
                      </td>
                      <td className="text-ink-900 px-4 py-2.5 text-right font-semibold tabular-nums">
                        {company.delivered}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {company.employeeCount}
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
                      {user.role === "admin" && (
                        <td className="px-4 py-2.5 text-right">
                          {company.employeeCount > 0 && (
                            <a
                              href={`/api/colaboradores/exportar?empresa=${company.id}`}
                              className="text-ink-700 hover:text-ink-900 text-xs font-semibold underline"
                            >
                              CSV
                              {/* "CSV" sozinho, repetido em cada linha, não diz
                                  a que empresa pertence. */}
                              <span className="sr-only">
                                {" "}
                                dos colaboradores de {company.name}
                              </span>
                            </a>
                          )}
                        </td>
                      )}
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
                    {totals.delivered}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {totals.employees}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {percent(totals.delivered, totals.employees)}%
                  </td>
                  {user.role === "admin" && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Ligação que descarrega um ficheiro.
 *
 * Não é um ProgressLink: o pedido não é uma navegação, a página fica onde
 * está e o browser recebe um ficheiro. A barra do topo nunca terminaria.
 */
function ExportLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="text-ink-900 ring-ink-300 hover:bg-ink-50 active:bg-ink-100 touch-manipulation rounded-lg bg-white px-3 py-2 text-sm font-semibold ring-1 transition duration-100 select-none active:scale-[0.97] motion-reduce:active:scale-100"
    >
      {children}
    </a>
  );
}

/** Cores da barra de cada métrica, segundo os papéis de estado da marca. */
type Tone = "disponivel" | "entregue" | "bloqueado";

const BARRAS: Record<Tone, string> = {
  disponivel: "bg-cyan-500",
  entregue: "bg-eco-500",
  bloqueado: "bg-laranja-500",
};

function Stat({ label, value, tone }: { label: string; value: number; tone?: Tone }) {
  // A cor identifica a métrica através de uma barra, não do número: sobre
  // branco, as cores secundárias da marca não têm contraste para texto.
  const bar = tone ? BARRAS[tone] : "bg-ink-300";

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
