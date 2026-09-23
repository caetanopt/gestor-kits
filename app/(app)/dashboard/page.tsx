import type { Metadata } from "next";
import { ProgressLink } from "@/components/ui/route-progress";
import { requireUser } from "@/lib/auth/dal";
import { listCompanyTotals } from "@/server/use-cases/companies";
import { percent, somarTotais } from "@/lib/ui/totais";

export const metadata: Metadata = { title: "Dashboard · Kits" };

// O dashboard reflete entregas a decorrer; não deve ser servido de cache.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Acessível a ambos os perfis. Vive fora de /admin de propósito: assim a
  // fronteira de permissões coincide com a estrutura do URL, e /admin pode
  // ser inteiramente administrativo.
  const user = await requireUser();
  const companies = await listCompanyTotals();

  const totals = somarTotais(companies);

  return (
    <div className="space-y-6">
      <h1 className="text-ink-900 font-display text-3xl font-normal">Dashboard</h1>

      {/* Contadores pousados no fundo escuro, sem cartão, como no convite:
          números grandes em Rubik fina, o de kits entregues a dourado. */}
      <dl className="grid grid-cols-2 gap-y-6 py-1 sm:grid-cols-4">
        <Stat label="Kits entregues" value={totals.delivered} destaque />
        {/* Quantos kits ainda faltam sair. É o número que diz se o evento
            está perto do fim, e sai dos mesmos totais por empresa — não
            custa uma consulta extra. */}
        <Stat label="Colaboradores sem kit" value={totals.porEntregar} />
        <Stat label="Colaboradores" value={totals.employees} />
        <Stat label="Empresas" value={companies.length} />
      </dl>

      {companies.length === 0 ? (
        <div className="ring-dourado-200 rounded bg-white p-8 text-center ring-1">
          <p className="text-ink-700 text-sm">Ainda não existem empresas.</p>
          <ProgressLink
            href="/admin/empresas"
            className="text-azul-900 mt-3 inline-block text-sm font-medium underline"
          >
            Criar a primeira empresa
          </ProgressLink>
        </div>
      ) : (
        <div className="ring-dourado-200 overflow-hidden rounded bg-white ring-1">
          {/* A exportação é só para administradores: o ficheiro leva nomes e
              emails de toda a gente, e um distribuidor não tem de os poder
              descarregar em bloco. */}
          <div className="border-dourado-100 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <h2 className="text-ink-900 font-display text-xl font-normal">
              Distribuição por empresa
            </h2>
            {user.role === "admin" && totals.employees > 0 && (
              <ExportLink href="/api/colaboradores/exportar">
                Exportar lista (CSV)
              </ExportLink>
            )}
          </div>

          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Kits entregues e colaboradores por empresa
              </caption>
              <thead>
                <tr className="border-dourado-100 text-dourado-700 border-b text-left text-xs tracking-[0.08em] uppercase">
                  <th scope="col" className="px-2 py-2 font-medium sm:px-4">
                    Empresa
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium sm:px-4">
                    Entregues
                  </th>
                  <th
                    scope="col"
                    className="hidden px-2 py-2 text-right font-medium sm:table-cell sm:px-4"
                  >
                    Colaboradores
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium sm:px-4">
                    % levantado
                  </th>
                  {user.role === "admin" && (
                    <th scope="col" className="hidden px-2 py-2 sm:table-cell sm:px-4">
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
                      className="border-dourado-100 border-b last:border-0"
                    >
                      <td className="text-ink-900 px-2 py-2.5 font-medium sm:px-4">
                        {/* O código só interessa a quem prepara ficheiros de
                          importação, e esses vivem na página Empresas. Aqui é
                          ruído. */}
                        {company.name}
                      </td>
                      <td className="text-ink-900 font-display px-2 py-2.5 text-right text-base font-medium tabular-nums sm:px-4">
                        {company.delivered}
                      </td>
                      <td className="text-ink-700 font-display hidden px-2 py-2.5 text-right text-base tabular-nums sm:table-cell sm:px-4">
                        {company.employeeCount}
                      </td>
                      <td className="px-2 py-2.5 text-right sm:px-4">
                        <div className="flex items-center justify-end gap-2">
                          <div
                            className="bg-dourado-100 h-1.5 w-16 overflow-hidden rounded-full"
                            aria-hidden="true"
                          >
                            <div
                              className="bg-dourado-500 h-full rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-ink-700 w-10 tabular-nums">{pct}%</span>
                        </div>
                      </td>
                      {user.role === "admin" && (
                        <td className="hidden px-2 py-2.5 text-right sm:table-cell sm:px-4">
                          {company.employeeCount > 0 && (
                            <a
                              href={`/api/colaboradores/exportar?empresa=${company.id}`}
                              className="text-azul-900 ring-dourado-200 hover:bg-dourado-50 active:bg-dourado-100 inline-flex min-h-9 items-center rounded px-2.5 text-xs font-semibold ring-1 ring-inset"
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
                <tr className="border-dourado-200 font-display border-t text-base font-medium">
                  <th scope="row" className="px-2 py-2.5 text-left sm:px-4">
                    Total
                  </th>
                  <td className="px-2 py-2.5 text-right tabular-nums sm:px-4">
                    {totals.delivered}
                  </td>
                  <td className="hidden px-2 py-2.5 text-right tabular-nums sm:table-cell sm:px-4">
                    {totals.employees}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums sm:px-4">
                    {percent(totals.delivered, totals.employees)}%
                  </td>
                  {user.role === "admin" && <td className="hidden sm:table-cell" />}
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
      className="text-azul-900 ring-azul-900 hover:bg-dourado-50 active:bg-dourado-100 inline-flex min-h-11 touch-manipulation items-center rounded bg-white px-3 py-2 text-sm font-semibold ring-1 transition duration-100 select-none active:scale-[0.97] motion-reduce:active:scale-100"
    >
      {children}
    </a>
  );
}

/**
 * Um contador do topo, pousado diretamente no fundo escuro do evento.
 *
 * Sem cartão: um filete dourado à esquerda separa-os. O de kits entregues
 * vai a dourado (13,6:1 sobre o fundo); os outros a branco. O rótulo usa o
 * tom auxiliar do tema, que sobre o fundo escuro dá 12,6:1.
 */
function Stat({
  label,
  value,
  destaque = false,
}: {
  label: string;
  value: number;
  destaque?: boolean;
}) {
  return (
    <div className="border-dourado-500/35 border-s px-4 sm:px-7">
      <dd
        className={`font-display text-4xl leading-none font-light tabular-nums sm:text-5xl ${
          destaque ? "text-dourado-300" : "text-white"
        }`}
      >
        {value}
      </dd>
      <dt className="text-ink-700 mt-2 text-xs tracking-[0.14em] uppercase">{label}</dt>
    </div>
  );
}
