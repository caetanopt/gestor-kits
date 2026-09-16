"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { formatDateTime } from "@/lib/format/date";
import type { EmployeeRow } from "@/lib/validation/employee";
import type { CompanyStockRow } from "@/lib/validation/company";

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
  companies: CompanyStockRow[];
  hasMore: boolean;
  page: number;
}) {
  const router = useRouter();
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
          onSubmit={save}
          className="ring-ink-200 space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1"
        >
          <h2 className="text-ink-900 font-semibold">
            {editing ? "Editar colaborador" : "Novo colaborador"}
          </h2>

          {error && <Alert tone="error">{error}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

            <Field label="Email" htmlFor="emp-email">
              <Input
                id="emp-email"
                type="email"
                value={draft.email}
                required
                maxLength={254}
                autoComplete="off"
                autoCapitalize="none"
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </Field>

            <Field label="Empresa" htmlFor="emp-company">
              <select
                id="emp-company"
                value={draft.companyId}
                required
                onChange={(e) => setDraft({ ...draft, companyId: e.target.value })}
                className="ring-ink-200 w-full rounded-lg bg-white px-3.5 py-2.5 ring-1 focus:ring-2 focus:ring-cyan-500"
              >
                <option value="">Selecione…</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
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
        <p className="ring-ink-200 text-ink-700 rounded-2xl bg-white p-8 text-center text-sm ring-1">
          Nenhum colaborador corresponde a estes filtros.
        </p>
      ) : (
        <div className="ring-ink-200 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1">
          <table className="w-full text-sm">
            <caption className="sr-only">Colaboradores</caption>
            <thead>
              <tr className="border-ink-200 text-ink-700 border-b text-left">
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
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id} className="border-ink-100 border-b last:border-0">
                  <td className="text-ink-900 px-4 py-3 font-medium tabular-nums">
                    {employee.employeeNumber}
                  </td>
                  <td className="text-ink-800 px-4 py-3">{employee.name}</td>
                  <td className="px-4 py-3">
                    {employee.email ? (
                      <span className="text-ink-700">{employee.email}</span>
                    ) : (
                      // Registo anterior à obrigatoriedade do email. Editá-lo
                      // obriga a preenchê-lo.
                      <span className="bg-amarelo-500 text-ink-800 inline-block rounded-md px-2 py-0.5 text-xs font-semibold">
                        Sem email
                      </span>
                    )}
                  </td>
                  <td className="text-ink-700 px-4 py-3">{employee.companyName}</td>
                  <td className="px-4 py-3">
                    {employee.kitDelivered ? (
                      <span className="bg-eco-500 text-ink-800 inline-block rounded-md px-2 py-0.5 text-xs font-semibold">
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
                      <span className="text-ink-800 inline-block rounded-md bg-cyan-500 px-2 py-0.5 text-xs font-semibold">
                        Por entregar
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="secondary"
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
