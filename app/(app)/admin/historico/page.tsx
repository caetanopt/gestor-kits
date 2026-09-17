import { Select } from "@/components/ui/field";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { ProgressLink } from "@/components/ui/route-progress";
import { requireAdmin } from "@/lib/auth/dal";
import { listCompanyTotals } from "@/server/use-cases/companies";
import { HISTORY_PAGE_SIZE, listHistory } from "@/server/use-cases/history";
import { paginar } from "@/lib/ui/paginacao";
import { historyFilterSchema, AUDIT_ACTION_LABELS } from "@/lib/validation/history";
import { formatDateTime } from "@/lib/format/date";
import { ReverseDeliveryButton } from "@/components/admin/reverse-delivery-button";

export const metadata: Metadata = { title: "Histórico · Kits" };
export const dynamic = "force-dynamic";

export default async function HistoricoPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const raw = await props.searchParams;
  const single = (key: string): string | undefined => {
    const value = raw[key];
    const text = Array.isArray(value) ? value[0] : value;
    return text && text.trim() !== "" ? text.trim() : undefined;
  };

  // Filtros inválidos no URL são ignorados em vez de rebentarem a página.
  const parsed = historyFilterSchema.safeParse({
    companyId: single("empresa"),
    action: single("acao"),
    employeeNumber: single("numero"),
    from: single("de"),
    to: single("ate"),
  });
  const filter = parsed.success ? parsed.data : {};

  const page = Number(single("pagina") ?? "0");
  const safePage = Number.isInteger(page) && page >= 0 ? page : 0;

  const [{ entries, total }, companies] = await Promise.all([
    listHistory(filter, safePage),
    listCompanyTotals(),
  ]);

  const { pageCount, primeiro, ultimo, temAnterior, temSeguinte, foraDeAlcance } =
    paginar(total, safePage, HISTORY_PAGE_SIZE);

  const pageHref = (next: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(raw)) {
      const text = Array.isArray(value) ? value[0] : value;
      if (text && key !== "pagina") params.set(key, text);
    }
    if (next > 0) params.set("pagina", String(next));
    const query = params.toString();
    return query ? `/admin/historico?${query}` : "/admin/historico";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-ink-900 text-xl font-semibold">Histórico</h1>
        <p className="text-ink-700 mt-1 text-sm">
          Todas as entregas, anulações e alterações administrativas.
        </p>
      </div>

      <form
        method="get"
        className="ring-ink-200 grid grid-cols-2 gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 sm:grid-cols-4 lg:grid-cols-6"
      >
        <Filter label="N.º colaborador" htmlFor="numero">
          <input
            id="numero"
            name="numero"
            defaultValue={filter.employeeNumber ?? ""}
            maxLength={40}
            className="ring-ink-200 w-full rounded-lg bg-white px-3 py-2 text-sm ring-1"
          />
        </Filter>

        <Filter label="Empresa" htmlFor="empresa" wide>
          <Select
            id="empresa"
            name="empresa"
            defaultValue={filter.companyId ?? ""}
            compact
          >
            <option value="">Todas</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </Select>
        </Filter>

        <Filter label="Ação" htmlFor="acao">
          <Select id="acao" name="acao" defaultValue={filter.action ?? ""} compact>
            <option value="">Todas</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Filter>

        <Filter label="De" htmlFor="de">
          <input
            id="de"
            name="de"
            type="date"
            defaultValue={filter.from ?? ""}
            className="ring-ink-200 w-full rounded-lg bg-white px-3 py-2 text-sm ring-1"
          />
        </Filter>

        <Filter label="Até" htmlFor="ate">
          <input
            id="ate"
            name="ate"
            type="date"
            defaultValue={filter.to ?? ""}
            className="ring-ink-200 w-full rounded-lg bg-white px-3 py-2 text-sm ring-1"
          />
        </Filter>

        <div className="col-span-2 flex items-end gap-2 sm:col-span-4 lg:col-span-2">
          <Button type="submit">Filtrar</Button>
          <ProgressLink
            href="/admin/historico"
            className="text-ink-700 hover:bg-ink-100 inline-flex min-h-11 items-center rounded-lg px-4 py-2.5 text-sm font-medium"
          >
            Limpar
          </ProgressLink>
        </div>
      </form>

      {entries.length === 0 ? (
        <div className="text-ink-700 ring-ink-200 space-y-3 rounded-2xl bg-white p-8 text-center text-sm ring-1">
          {foraDeAlcance ? (
            <>
              <p>
                Esta página já não existe: os filtros atuais dão{" "}
                {pageCount === 1 ? "uma página" : `${pageCount} páginas`}.
              </p>
              <p>
                <ProgressLink
                  href={pageHref(pageCount - 1)}
                  className="text-ink-900 font-semibold underline"
                >
                  Ir para a última página
                </ProgressLink>
              </p>
            </>
          ) : (
            <p>Sem registos para estes filtros.</p>
          )}
        </div>
      ) : (
        // Mesma solução das outras tabelas: abaixo de lg cada registo é um
        // cartão. Com seis colunas, o botão Anular nunca estava no ecrã ao
        // mesmo tempo que o nome de quem recebeu o kit — anular às cegas numa
        // ação destrutiva é o pior sítio para o fazer.
        <div className="ring-ink-200 relative rounded-2xl bg-white shadow-sm ring-1 md:overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Registo de ações</caption>
            <thead className="hidden md:table-header-group">
              <tr className="border-ink-200 text-ink-700 border-b text-left">
                <th scope="col" className="px-4 py-2 font-medium">
                  Data e hora
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Ação
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Colaborador
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Empresa
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Operador
                </th>
                <th scope="col" className="px-4 py-2">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-ink-100 block border-b p-4 last:border-0 md:table-row md:p-0"
                >
                  <td className="text-ink-700 block px-0 py-1 tabular-nums md:table-cell md:px-4 md:py-2.5 md:whitespace-nowrap">
                    {formatDateTime(entry.performedAt)}
                  </td>
                  <td className="block px-0 py-1 break-words md:table-cell md:px-4 md:py-2.5">
                    {/* A ação é distinguida por uma pastilha com fundo de cor
                        e texto antracite: as cores da marca não têm contraste
                        para servirem de cor de texto sobre branco. */}
                    <span
                      className={
                        entry.action === "DELIVERY_REVERSED"
                          ? "bg-laranja-500 text-ink-800 inline-block rounded-md px-2 py-0.5 font-semibold"
                          : entry.action === "DELIVERED"
                            ? "bg-eco-500 text-ink-800 inline-block rounded-md px-2 py-0.5 font-semibold"
                            : "text-ink-700"
                      }
                    >
                      {AUDIT_ACTION_LABELS[entry.action]}
                    </span>
                    {entry.notes && (
                      <span className="text-ink-700 block text-xs">{entry.notes}</span>
                    )}
                  </td>
                  <td className="block px-0 py-1 break-words md:table-cell md:px-4 md:py-2.5">
                    {entry.employeeName ? (
                      <>
                        {entry.employeeName}
                        <span className="text-ink-700 block text-xs tabular-nums">
                          N.º {entry.employeeNumber}
                        </span>
                      </>
                    ) : (
                      <span className="text-ink-700">—</span>
                    )}
                  </td>
                  <td className="text-ink-700 block px-0 py-1 break-words md:table-cell md:px-4 md:py-2.5">
                    <span className="text-ink-700 md:hidden">Empresa: </span>
                    {entry.companyName ?? <span className="text-ink-700">—</span>}
                  </td>
                  <td className="text-ink-700 block px-0 py-1 break-words md:table-cell md:px-4 md:py-2.5">
                    <span className="text-ink-700 md:hidden">Operador: </span>
                    {entry.performedByName}
                  </td>
                  <td className="block px-0 pt-2 pb-1 md:table-cell md:px-4 md:py-2.5 md:text-right">
                    {entry.action === "DELIVERED" &&
                      entry.isActiveDelivery &&
                      entry.deliveryId && (
                        <ReverseDeliveryButton
                          deliveryId={entry.deliveryId}
                          employeeLabel={`${entry.employeeName ?? ""} (N.º ${entry.employeeNumber ?? "?"})`}
                        />
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && !foraDeAlcance && (
        <nav
          aria-label="Paginação"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          {/* A contagem vem primeiro: é ela que diz se vale a pena percorrer
              as páginas ou se é melhor apertar os filtros. */}
          <p className="text-ink-700 text-sm">
            {primeiro}–{ultimo} de {total} {total === 1 ? "registo" : "registos"}
            {pageCount > 1 && (
              <span>
                {" "}
                · página {safePage + 1} de {pageCount}
              </span>
            )}
          </p>

          {pageCount > 1 && (
            <div className="flex gap-2">
              <PageLink href={pageHref(safePage - 1)} disponivel={temAnterior}>
                ← Anteriores
              </PageLink>
              <PageLink href={pageHref(safePage + 1)} disponivel={temSeguinte}>
                Seguintes →
              </PageLink>
            </div>
          )}
        </nav>
      )}
    </div>
  );
}

/**
 * Ligação de página.
 *
 * Nos extremos o botão fica lá, apagado e fora da ordem de tabulação, em vez
 * de desaparecer: um controlo que some faz os outros saltarem de sítio entre
 * páginas, e a primeira e a última são precisamente onde isso acontece.
 */
function PageLink({
  href,
  disponivel,
  children,
}: {
  href: string;
  disponivel: boolean;
  children: React.ReactNode;
}) {
  const base =
    "ring-ink-200 inline-flex min-h-11 items-center rounded-lg bg-white px-4 py-2.5 text-sm font-medium ring-1 transition duration-100 select-none";

  if (!disponivel) {
    return (
      <span aria-hidden="true" className={`${base} text-ink-500 opacity-60`}>
        {children}
      </span>
    );
  }

  return (
    <ProgressLink
      href={href}
      className={`${base} text-ink-900 hover:bg-ink-50 active:bg-ink-100 touch-manipulation active:scale-[0.97] motion-reduce:active:scale-100`}
    >
      {children}
    </ProgressLink>
  );
}

function Filter({
  label,
  htmlFor,
  wide = false,
  children,
}: {
  label: string;
  htmlFor: string;
  /** Ocupa duas colunas: um nome de empresa não cabe na largura de uma. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <label htmlFor={htmlFor} className="text-ink-700 mb-1 block text-xs font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
