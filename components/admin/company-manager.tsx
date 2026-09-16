"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { deriveCode, type CompanyStockRow } from "@/lib/validation/company";

type Draft = { id?: string; name: string; code: string; allocatedKits: string };

const EMPTY: Draft = { name: "", code: "", allocatedKits: "0" };

type ApiEnvelope =
  | { success: true; data: unknown }
  | { success: false; code: string; message: string; details?: string[] };

export function CompanyManager({ companies }: { companies: CompanyStockRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const editing = draft?.id !== undefined;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;

    const allocatedKits = Number(draft.allocatedKits);
    if (!Number.isInteger(allocatedKits) || allocatedKits < 0) {
      setError("O número de kits tem de ser um inteiro igual ou superior a zero.");
      return;
    }

    setSaving(true);
    setError(null);

    const response = await fetch(
      draft.id ? `/api/companies/${draft.id}` : "/api/companies",
      {
        method: draft.id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        // Código vazio: o servidor deriva-o do nome ao criar e preserva o
        // existente ao editar.
        body: JSON.stringify({
          name: draft.name,
          code: draft.code.trim() || undefined,
          allocatedKits,
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

    setNotice(draft.id ? "Empresa atualizada." : "Empresa criada.");
    setDraft(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {notice && <Alert tone="success">{notice}</Alert>}

      {draft === null ? (
        <Button
          type="button"
          onClick={() => {
            setDraft({ ...EMPTY });
            setError(null);
            setNotice(null);
          }}
        >
          Nova empresa
        </Button>
      ) : (
        <form
          onSubmit={save}
          className="ring-ink-200 space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1"
        >
          <h2 className="text-ink-900 font-semibold">
            {editing ? "Editar empresa" : "Nova empresa"}
          </h2>

          {error && <Alert tone="error">{error}</Alert>}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Nome" htmlFor="company-name">
              <Input
                id="company-name"
                value={draft.name}
                required
                maxLength={120}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>

            <Field
              label="Código"
              htmlFor="company-code"
              hint="Opcional. Vazio gera a partir do nome."
            >
              <Input
                id="company-code"
                value={draft.code}
                maxLength={40}
                placeholder={draft.name ? deriveCode(draft.name) : "—"}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              />
            </Field>

            <Field
              label="Kits atribuídos"
              htmlFor="company-kits"
              hint={editing ? "Não pode ficar abaixo do já entregue." : undefined}
            >
              <Input
                id="company-kits"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={draft.allocatedKits}
                required
                onChange={(e) => setDraft({ ...draft, allocatedKits: e.target.value })}
              />
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

      {companies.length === 0 ? (
        <p className="text-ink-700 ring-ink-200 rounded-2xl bg-white p-8 text-center text-sm ring-1">
          Ainda não existem empresas. Crie a primeira para poder importar colaboradores.
        </p>
      ) : (
        <div className="ring-ink-200 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Empresas participantes e respetivo stock de kits
            </caption>
            <thead>
              <tr className="border-ink-200 text-ink-700 border-b text-left">
                <th scope="col" className="px-4 py-3 font-medium">
                  Empresa
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Código
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Atribuídos
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Entregues
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Disponíveis
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Colaboradores
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id} className="border-ink-100 border-b last:border-0">
                  <td className="text-ink-900 px-4 py-3 font-medium">{company.name}</td>
                  <td className="text-ink-700 px-4 py-3">{company.code}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {company.allocated}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {company.delivered}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {company.available === 0 ? (
                      <span className="bg-laranja-500 text-ink-800 inline-block rounded-md px-2.5 py-1 font-bold tabular-nums">
                        0<span className="sr-only"> — esgotado</span>
                      </span>
                    ) : (
                      <span className="text-ink-900 font-semibold tabular-nums">
                        {company.available}
                      </span>
                    )}
                  </td>
                  <td className="text-ink-700 px-4 py-3 text-right tabular-nums">
                    {company.employeeCount}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setDraft({
                          id: company.id,
                          name: company.name,
                          code: company.code,
                          allocatedKits: String(company.allocated),
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
    </div>
  );
}
