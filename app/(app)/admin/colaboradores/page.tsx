import { Select } from "@/components/ui/field";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { ProgressLink } from "@/components/ui/route-progress";
import { requireAdmin } from "@/lib/auth/dal";
import { listCompanyTotals } from "@/server/use-cases/companies";
import { countManualEmployees, listEmployees } from "@/server/use-cases/employees";
import { employeeFilterSchema } from "@/lib/validation/employee";
import { EmployeeManager } from "@/components/admin/employee-manager";

export const metadata: Metadata = { title: "Colaboradores · Kits" };
export const dynamic = "force-dynamic";

export default async function ColaboradoresPage(props: {
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
  const parsed = employeeFilterSchema.safeParse({
    q: single("q"),
    companyId: single("empresa"),
    estado: single("estado"),
    semEmail: single("sem-email") === "1",
  });
  const filter = parsed.success ? parsed.data : {};

  const pagina = Number(single("pagina") ?? "0");
  const page = Number.isInteger(pagina) && pagina >= 0 ? pagina : 0;

  const [{ rows, hasMore }, companies, manuais] = await Promise.all([
    listEmployees(filter, page),
    listCompanyTotals(),
    countManualEmployees(),
  ]);

  const paginaHref = (destino: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(raw)) {
      const text = Array.isArray(value) ? value[0] : value;
      if (text && key !== "pagina") params.set(key, text);
    }
    if (destino > 0) params.set("pagina", String(destino));
    const query = params.toString();
    return query ? `/admin/colaboradores?${query}` : "/admin/colaboradores";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-ink-900 font-display text-3xl font-normal">
            Colaboradores
          </h1>
          <p className="text-ink-700 mt-1 text-sm">
            Adicione um a um ou importe um ficheiro.
          </p>
        </div>
        <ProgressLink
          href="/admin/importar"
          className="ring-azul-900 text-azul-900 hover:bg-dourado-50 inline-flex min-h-11 items-center rounded bg-white px-4 py-2.5 text-sm font-semibold ring-1"
        >
          Importar ficheiro
        </ProgressLink>
      </div>

      {/* Exportação dos acrescentados à mão. A página já é só para
          administradores (requireAdmin acima), tal como a rota. */}
      <section
        aria-labelledby="manuais-titulo"
        className="ring-dourado-200 flex flex-wrap items-center justify-between gap-4 rounded bg-white p-4 ring-1 sm:p-5"
      >
        <div className="min-w-0">
          <h2
            id="manuais-titulo"
            className="text-ink-900 font-display text-xl font-normal"
          >
            Acrescentados manualmente
          </h2>
          <p className="text-ink-700 mt-1 text-sm">
            {manuais === 0
              ? "Ainda não foi acrescentado nenhum colaborador à mão."
              : `${manuais} ${manuais === 1 ? "colaborador acrescentado" : "colaboradores acrescentados"} no balcão de distribuição ou nesta página. Não inclui os importados de ficheiro.`}
          </p>
        </div>
        {manuais > 0 && (
          // <a> e não ProgressLink: é um ficheiro a descarregar, não uma
          // navegação, e a barra de progresso do topo nunca terminaria.
          <a
            href="/api/colaboradores/exportar/manuais"
            className="text-azul-900 ring-azul-900 hover:bg-dourado-50 active:bg-dourado-100 inline-flex min-h-11 shrink-0 touch-manipulation items-center rounded bg-white px-4 py-2.5 text-sm font-semibold ring-1 transition duration-100 select-none active:scale-[0.97] motion-reduce:active:scale-100"
          >
            Exportar (CSV)
          </a>
        )}
      </section>

      <form
        method="get"
        className="ring-dourado-200 grid gap-3 rounded bg-white p-4 ring-1 sm:grid-cols-3 lg:grid-cols-4"
      >
        <div className="sm:col-span-2">
          <label htmlFor="q" className="text-ink-700 mb-1 block text-xs font-medium">
            Pesquisar
          </label>
          <input
            id="q"
            name="q"
            defaultValue={filter.q ?? ""}
            maxLength={160}
            placeholder="Número, nome ou email"
            className="ring-dourado-200 placeholder:text-ink-700 w-full rounded bg-white px-3 py-2 text-sm ring-1"
          />
        </div>

        <div>
          <label
            htmlFor="empresa"
            className="text-ink-700 mb-1 block text-xs font-medium"
          >
            Empresa
          </label>
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
        </div>

        <div>
          <label htmlFor="estado" className="text-ink-700 mb-1 block text-xs font-medium">
            Kit
          </label>
          <Select id="estado" name="estado" defaultValue={filter.estado ?? ""} compact>
            <option value="">Todos</option>
            <option value="por-entregar">Por entregar</option>
            <option value="entregue">Entregue</option>
          </Select>
        </div>

        <div className="flex items-end">
          <label className="text-ink-800 flex min-h-11 items-center gap-2 py-2 text-sm">
            <input
              type="checkbox"
              name="sem-email"
              value="1"
              defaultChecked={filter.semEmail === true}
              className="size-5"
            />
            Apenas sem email
          </label>
        </div>

        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
          <Button type="submit">Filtrar</Button>
          <ProgressLink
            href="/admin/colaboradores"
            className="text-ink-700 hover:bg-ink-100 inline-flex min-h-11 items-center rounded px-4 py-2.5 text-sm font-medium"
          >
            Limpar
          </ProgressLink>
        </div>
      </form>

      <EmployeeManager
        employees={rows}
        companies={companies}
        hasMore={hasMore}
        page={page}
      />

      {(page > 0 || hasMore) && (
        <nav aria-label="Paginação" className="flex justify-between">
          {page > 0 ? (
            <ProgressLink
              href={paginaHref(page - 1)}
              className="ring-dourado-200 rounded bg-white px-4 py-2.5 text-sm font-medium ring-1"
            >
              ← Anteriores
            </ProgressLink>
          ) : (
            <span />
          )}
          {hasMore && (
            <ProgressLink
              href={paginaHref(page + 1)}
              className="ring-dourado-200 rounded bg-white px-4 py-2.5 text-sm font-medium ring-1"
            >
              Seguintes →
            </ProgressLink>
          )}
        </nav>
      )}
    </div>
  );
}
