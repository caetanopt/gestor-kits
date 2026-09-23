"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { formatDateTime } from "@/lib/format/date";
import type { EmployeeRow } from "@/lib/validation/employee";
import type { CompanyTotalsRow } from "@/lib/validation/company";

type Draft = {
  id?: string;
  employeeNumber: string;
  name: string;
  email: string;
  companyId: string;
};

type ApiEnvelope =
  | { success: true; data: unknown }
  | { success: false; code: string; message: string; details?: string[] };

export function EmployeeManager({
  employees,
  companies,
  hasMore,
  page,
}: {
  employees: EmployeeRow[];
  companies: CompanyTotalsRow[];
  hasMore: boolean;
  page: number;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  /**
   * Leva o ecrã ao formulário e põe o cursor no primeiro campo.
   *
   * O formulário abre no topo da página. Quem prime "Editar" na décima linha
   * de uma lista não vê nada mudar — e num telemóvel, onde a lista é muito
   * mais alta, nem sequer desconfia de que abriu.
   */
  const mostrarFormulario = () => {
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      formRef.current?.querySelector<HTMLInputElement>("#emp-number")?.focus();
    });
  };
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const editing = draft?.id !== undefined;

  function novo() {
    setDraft({
      employeeNumber: "",
      name: "",
      email: "",
      // Uma só empresa: pré-selecioná-la poupa um passo em todas as criações.
      companyId: companies.length === 1 ? (companies[0]?.id ?? "") : "",
    });
    setError(null);
    setNotice(null);
    mostrarFormulario();
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;

    setSaving(true);
    setError(null);

    const response = await fetch(
      draft.id ? `/api/admin/employees/${draft.id}` : "/api/admin/employees",
      {
        method: draft.id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeNumber: draft.employeeNumber,
          name: draft.name,
          email: draft.email,
          companyId: draft.companyId,
        }),
      },
    ).catch(() => null);

    const result = (await response?.json().catch(() => null)) as ApiEnvelope | null;
    setSaving(false);

    if (!result) {
      setError("Sem ligação ao servidor. Tente novamente.");
      return;
    }
    if (!result.success) {
      setError(result.details?.[0] ?? result.message);
      return;
    }

    setNotice(draft.id ? "Colaborador atualizado." : "Colaborador criado.");
    setDraft(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {notice && <Alert tone="success">{notice}</Alert>}

      {companies.length === 0 ? (
        <Alert tone="warning" title="Crie primeiro as empresas.">
          <p>Cada colaborador tem de pertencer a uma empresa existente.</p>
        </Alert>
      ) : draft === null ? (
        <Button type="button" onClick={novo}>
          Novo colaborador
        </Button>
      ) : (
        <form
          ref={formRef}
          onSubmit={save}
          className="ring-dourado-200 space-y-4 rounded bg-white p-5 ring-1"
        >
          <h2 className="text-ink-900 font-display text-xl font-normal">
            {editing ? "Editar colaborador" : "Novo colaborador"}
          </h2>

          {error && <Alert tone="error">{error}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="N.º colaborador" htmlFor="emp-number">
              <Input
                id="emp-number"
                value={draft.employeeNumber}
                required
                maxLength={40}
                inputMode="numeric"
                autoComplete="off"
                onChange={(e) => setDraft({ ...draft, employeeNumber: e.target.value })}
              />
            </Field>

            <Field label="Nome" htmlFor="emp-name">
              <Input
                id="emp-name"
                value={draft.name}
                required
                maxLength={160}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>

            <Field label="Email" htmlFor="emp-email" hint="Opcional.">
              <Input
                id="emp-email"
                type="email"
                value={draft.email}
                maxLength={254}
                autoComplete="off"
                autoCapitalize="none"
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </Field>

            <Field label="Empresa" htmlFor="emp-company">
              <Select
                id="emp-company"
                value={draft.companyId}
                required
                onChange={(e) => setDraft({ ...draft, companyId: e.target.value })}
              >
                <option value="">Selecione…</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "A guardar…" : "Guardar"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {employees.length === 0 ? (
        <p className="ring-dourado-200 text-ink-700 rounded bg-white p-8 text-center text-sm ring-1">
          Nenhum colaborador corresponde a estes filtros.
        </p>
      ) : (
        // Mesma solução dos Utilizadores: abaixo de lg a tabela vira lista de
        // cartões. Com seis colunas e emails compridos, a tabela media 919px
        // dentro de um contentor de 358 a 390px — para ver o estado do kit era
        // preciso arrastar até o nome sair do ecrã, e ficavam cinco botões
        // "Editar" iguais sem se saber a quem pertenciam.
        <div className="ring-dourado-200 relative rounded bg-white ring-1 md:overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Colaboradores</caption>
            <thead className="hidden md:table-header-group">
              <tr className="border-dourado-100 text-dourado-700 border-b text-left text-xs tracking-[0.08em] uppercase">
                <th scope="col" className="px-4 py-3 font-medium">
                  N.º
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Nome
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Email
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Empresa
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Kit
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {employees.map((employee) => (
                <tr
                  key={employee.id}
                  className="border-dourado-100 block border-b p-4 last:border-0 md:table-row md:p-0"
                >
                  <td className="text-ink-900 block px-0 py-1 font-medium tabular-nums md:table-cell md:px-4 md:py-3">
                    <span className="text-ink-700 font-normal md:hidden">N.º </span>
                    {employee.employeeNumber}
                  </td>
                  <td className="text-ink-800 block px-0 py-1 break-words md:table-cell md:px-4 md:py-3">
                    {employee.name}
                  </td>
                  <td className="block px-0 py-1 break-all md:table-cell md:px-4 md:py-3">
                    {employee.email ? (
                      <span className="text-ink-700">{employee.email}</span>
                    ) : (
                      // Um traço e não um crachá de aviso: o email é opcional, e
                      // pintar de amarelo uma ausência normal era dar a entender
                      // que havia ali alguma coisa por corrigir.
                      <span className="text-ink-700" aria-label="sem email">
                        —
                      </span>
                    )}
                  </td>
                  <td className="text-ink-700 block px-0 py-1 break-words md:table-cell md:px-4 md:py-3">
                    {employee.companyName}
                  </td>
                  <td className="block px-0 py-1 md:table-cell md:px-4 md:py-3">
                    {employee.kitDelivered ? (
                      <span className="bg-eco-500 text-ink-800 inline-block rounded px-2 py-0.5 text-xs font-semibold">
                        Entregue
                        {employee.deliveredAt && (
                          <span className="sr-only">
                            {" "}
                            em {formatDateTime(employee.deliveredAt)}
                            {employee.deliveredByName &&
                              ` por ${employee.deliveredByName}`}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="border-dourado-600 text-dourado-700 inline-block rounded border px-2 py-0.5 text-xs font-semibold">
                        Por entregar
                      </span>
                    )}
                  </td>
                  <td className="block px-0 pt-3 pb-1 md:table-cell md:px-4 md:py-3 md:text-right">
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full md:w-auto"
                      onClick={() => {
                        setDraft({
                          id: employee.id,
                          employeeNumber: employee.employeeNumber,
                          name: employee.name,
                          email: employee.email ?? "",
                          companyId: employee.companyId,
                        });
                        setError(null);
                        setNotice(null);
                        mostrarFormulario();
                      }}
                    >
                      Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(page > 0 || hasMore) && (
        <p className="text-ink-700 text-center text-sm">
          Página {page + 1}
          {hasMore ? " · há mais resultados; refine a pesquisa" : ""}
        </p>
      )}
    </div>
  );
}
