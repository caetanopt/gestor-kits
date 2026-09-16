import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { ProgressLink } from "@/components/ui/route-progress";
import { requireAdmin } from "@/lib/auth/dal";
import { listCompanyStock } from "@/server/use-cases/companies";
import { listHistory } from "@/server/use-cases/history";
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

  const [{ entries, hasMore }, companies] = await Promise.all([
    listHistory(filter, safePage),
    listCompanyStock(),
  ]);

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
        className="ring-ink-200 grid gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 sm:grid-cols-5"
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

        <Filter label="Empresa" htmlFor="empresa">
          <select
            id="empresa"
            name="empresa"
            defaultValue={filter.companyId ?? ""}
            className="ring-ink-200 w-full rounded-lg bg-white px-3 py-2 text-sm ring-1"
          >
            <option value="">Todas</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </Filter>

        <Filter label="Ação" htmlFor="acao">
          <select
            id="acao"
            name="acao"
            defaultValue={filter.action ?? ""}
            className="ring-ink-200 w-full rounded-lg bg-white px-3 py-2 text-sm ring-1"
          >
            <option value="">Todas</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
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

        <div className="flex items-end gap-2 sm:col-span-5">
          <Button type="submit">Filtrar</Button>
          <ProgressLink
            href="/admin/historico"
            className="text-ink-700 hover:bg-ink-100 rounded-lg px-4 py-2.5 text-sm font-medium"
          >
            Limpar
          </ProgressLink>
        </div>
      </form>

      {entries.length === 0 ? (
        <p className="text-ink-700 ring-ink-200 rounded-2xl bg-white p-8 text-center text-sm ring-1">
          Sem registos para estes filtros.
        </p>
      ) : (
        <div className="ring-ink-200 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1">
          <table className="w-full text-sm">
            <caption className="sr-only">Registo de ações</caption>
            <thead>
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
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-ink-100 border-b last:border-0">
                  <td className="text-ink-700 px-4 py-2.5 whitespace-nowrap tabular-nums">
                    {formatDateTime(entry.performedAt)}
                  </td>
                  <td className="px-4 py-2.5">
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
                  <td className="px-4 py-2.5">
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
                  <td className="text-ink-700 px-4 py-2.5">
                    {entry.companyName ?? <span className="text-ink-700">—</span>}
                  </td>
                  <td className="text-ink-700 px-4 py-2.5">{entry.performedByName}</td>
                  <td className="px-4 py-2.5 text-right">
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

      {(safePage > 0 || hasMore) && (
        <nav aria-label="Paginação" className="flex justify-between">
          {safePage > 0 ? (
            <ProgressLink
              href={pageHref(safePage - 1)}
              className="ring-ink-200 rounded-lg bg-white px-4 py-2.5 text-sm font-medium ring-1"
            >
              ← Anteriores
            </ProgressLink>
          ) : (
            <span />
          )}
          {hasMore && (
            <ProgressLink
              href={pageHref(safePage + 1)}
              className="ring-ink-200 rounded-lg bg-white px-4 py-2.5 text-sm font-medium ring-1"
            >
              Seguintes →
            </ProgressLink>
          )}
        </nav>
      )}
    </div>
  );
}

function Filter({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-ink-700 mb-1 block text-xs font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
