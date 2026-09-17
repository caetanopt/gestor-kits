"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import type { UserRole } from "@/lib/supabase/database.types";
import type { UserRow } from "@/lib/validation/user";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  distributor: "Distribuidor",
};

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: "Acesso total, incluindo utilizadores.",
  distributor: "Apenas Dashboard e Distribuição.",
};

type ApiEnvelope =
  | { success: true; data: unknown }
  | { success: false; code: string; message: string; details?: string[] };

type Draft = { email: string; fullName: string; password: string; role: UserRole };

const EMPTY: Draft = { email: "", fullName: "", password: "", role: "distributor" };

export function UserManager({
  users,
  currentUserId,
  canCreate,
}: {
  users: UserRow[];
  currentUserId: string;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  // Edição do nome de uma conta existente, uma de cada vez.
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const administradoresAtivos = users.filter(
    (u) => u.role === "admin" && u.isActive,
  ).length;

  async function pedir(url: string, init: RequestInit): Promise<boolean> {
    setError(null);
    const response = await fetch(url, init).catch(() => null);
    const result = (await response?.json().catch(() => null)) as ApiEnvelope | null;

    if (!result) {
      setError("Sem ligação ao servidor. Tente novamente.");
      return false;
    }
    if (!result.success) {
      setError(result.details?.[0] ?? result.message);
      return false;
    }
    return true;
  }

  async function guardarNome(event: React.FormEvent) {
    event.preventDefault();
    if (!rename) return;

    const nome = rename.name.trim();
    if (!nome) {
      setError("Indique o nome.");
      return;
    }

    setBusy(rename.id);
    const ok = await pedir(`/api/admin/users/${rename.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nome }),
    });
    setBusy(null);

    if (ok) {
      setNotice(`O nome passou a ${nome}.`);
      setRename(null);
      router.refresh();
    }
  }

  async function alterarPapel(user: UserRow, role: UserRole) {
    setBusy(user.id);
    const ok = await pedir(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setBusy(null);
    if (ok) {
      setNotice(`${user.email} passou a ${ROLE_LABELS[role].toLowerCase()}.`);
      router.refresh();
    }
  }

  async function alterarAtivo(user: UserRow, isActive: boolean) {
    setBusy(user.id);
    const ok = await pedir(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    setBusy(null);
    if (ok) {
      setNotice(`${user.email} foi ${isActive ? "reativado" : "desativado"}.`);
      router.refresh();
    }
  }

  async function criar(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;

    setBusy("novo");
    const ok = await pedir("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: draft.email,
        fullName: draft.fullName.trim() || undefined,
        password: draft.password,
        role: draft.role,
      }),
    });
    setBusy(null);

    if (ok) {
      setNotice(`Conta criada para ${draft.email}.`);
      setDraft(null);
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {!canCreate ? (
        <Alert tone="info" title="Criação de contas pelo painel do Supabase.">
          <p>
            Para criar contas a partir daqui, defina a variável de ambiente{" "}
            <code>SUPABASE_SERVICE_ROLE_KEY</code>. Sem ela, crie as contas em{" "}
            <strong>Authentication → Users</strong> no Supabase; aparecem nesta lista como
            distribuidores.
          </p>
        </Alert>
      ) : draft === null ? (
        <Button
          type="button"
          onClick={() => {
            setDraft({ ...EMPTY });
            setError(null);
            setNotice(null);
          }}
        >
          Nova conta
        </Button>
      ) : (
        <form
          onSubmit={criar}
          className="ring-ink-200 space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1"
        >
          <h2 className="text-ink-900 font-semibold">Nova conta</h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_2fr_1fr_1fr]">
            <Field label="Email" htmlFor="user-email">
              <Input
                id="user-email"
                type="email"
                value={draft.email}
                required
                autoComplete="off"
                autoCapitalize="none"
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </Field>

            <Field
              label="Nome"
              htmlFor="user-name"
              hint="Identifica a pessoa no topo da página."
            >
              <Input
                id="user-name"
                value={draft.fullName}
                required
                maxLength={160}
                autoComplete="off"
                onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
              />
            </Field>

            <Field
              label="Palavra-passe"
              htmlFor="user-password"
              hint="Mínimo 8 caracteres."
            >
              <Input
                id="user-password"
                type="text"
                value={draft.password}
                required
                minLength={8}
                maxLength={72}
                autoComplete="off"
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              />
            </Field>

            <Field
              label="Perfil"
              htmlFor="user-role"
              hint={ROLE_DESCRIPTIONS[draft.role]}
            >
              <Select
                id="user-role"
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value as UserRole })}
              >
                <option value="distributor">Distribuidor</option>
                <option value="admin">Administrador</option>
              </Select>
            </Field>
          </div>

          <p className="text-ink-700 text-xs">
            A palavra-passe é mostrada em claro para a poder entregar à pessoa. A conta
            fica confirmada e pronta a usar.
          </p>

          <div className="flex gap-2">
            <Button type="submit" disabled={busy === "novo"}>
              {busy === "novo" ? "A criar…" : "Criar conta"}
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

      {/* Abaixo de lg a tabela vira lista de cartões. Medido a 390: a tabela
          tinha 787px dentro de um contentor de 358, e os botões de ação
          acabavam 413px para lá da margem — inalcançáveis, sem nada a
          anunciar que existiam. */}
      <div className="ring-ink-200 relative rounded-2xl bg-white shadow-sm ring-1 lg:overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Contas de utilizador</caption>
          <thead className="hidden lg:table-header-group">
            <tr className="border-ink-200 text-ink-700 border-b text-left">
              <th scope="col" className="px-4 py-3 font-medium">
                Utilizador
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Perfil
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Estado
              </th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className="block lg:table-row-group">
            {users.map((user) => {
              const eu = user.id === currentUserId;
              // Espelha a salvaguarda do SQL: sem isto o botão convidaria a
              // uma ação que o servidor iria recusar.
              const ultimoAdmin =
                user.role === "admin" && user.isActive && administradoresAtivos <= 1;
              const ocupado = busy === user.id;
              const aRenomear = rename?.id === user.id;

              return (
                <tr
                  key={user.id}
                  className="border-ink-100 block border-b p-4 last:border-0 lg:table-row lg:p-0"
                >
                  <td className="block px-0 py-1 break-words lg:table-cell lg:px-4 lg:py-3">
                    {aRenomear ? (
                      <form onSubmit={guardarNome} className="flex flex-wrap gap-2">
                        {/* O email fica à vista: sem ele, a linha em edição
                            perdia a única coisa que diz de quem é. */}
                        <span className="text-ink-700 w-full text-xs break-all">
                          {user.email}
                        </span>
                        <label htmlFor={`nome-${user.id}`} className="sr-only">
                          Nome de {user.email}
                        </label>
                        <Input
                          id={`nome-${user.id}`}
                          value={rename.name}
                          required
                          maxLength={160}
                          autoFocus
                          autoComplete="off"
                          // Largura fixa: a crescer com a célula, a coluna
                          // "Utilizador" alargava e empurrava os botões das
                          // outras linhas para uma segunda fila.
                          className="sm:w-64"
                          onChange={(e) => setRename({ ...rename, name: e.target.value })}
                        />
                        <Button type="submit" disabled={ocupado}>
                          {ocupado ? "A guardar…" : "Guardar"}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setRename(null);
                            setError(null);
                          }}
                        >
                          Cancelar
                        </Button>
                      </form>
                    ) : (
                      <>
                        <span className="text-ink-900 font-medium break-all">
                          {user.name || user.email}
                        </span>
                        {user.name && (
                          <span className="text-ink-700 block text-xs break-all">
                            {user.email}
                          </span>
                        )}
                        {/* Uma conta sem nome mostra o email no cabeçalho. Vale
                            a pena dizê-lo onde se resolve. */}
                        {!user.name && (
                          <span className="text-ink-700 block text-xs">
                            sem nome — aparece o email no topo
                          </span>
                        )}
                        {eu && (
                          <span className="text-ink-700 block text-xs italic">
                            a sua conta
                          </span>
                        )}
                        {/* Junto ao nome e não no grupo de ações: é onde se
                            procura, e ali um terceiro botão empurrava o
                            "Desativar" para uma segunda linha. */}
                        <button
                          type="button"
                          aria-label={`Editar nome de ${user.email}`}
                          disabled={ocupado}
                          onClick={() => {
                            setRename({ id: user.id, name: user.name });
                            setError(null);
                            setNotice(null);
                          }}
                          className="text-ink-700 hover:text-ink-900 mt-1 inline-flex min-h-11 touch-manipulation items-center text-xs font-semibold underline select-none lg:min-h-0"
                        >
                          Editar nome
                        </button>
                      </>
                    )}
                  </td>

                  <td className="block px-0 py-1 break-words lg:table-cell lg:px-4 lg:py-3">
                    <span
                      className={
                        user.role === "admin"
                          ? "bg-amarelo-500 text-ink-800 inline-block rounded-md px-2 py-0.5 text-xs font-semibold"
                          : "text-ink-800 inline-block rounded-md bg-cyan-500 px-2 py-0.5 text-xs font-semibold"
                      }
                    >
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>

                  <td className="block px-0 py-1 break-words lg:table-cell lg:px-4 lg:py-3">
                    {user.isActive ? (
                      <span className="text-ink-800">Ativa</span>
                    ) : (
                      <span className="bg-ink-200 text-ink-800 inline-block rounded-md px-2 py-0.5 text-xs font-semibold">
                        Desativada
                      </span>
                    )}
                  </td>

                  <td className="block px-0 py-1 break-words lg:table-cell lg:px-4 lg:py-3">
                    {/* `lg:flex-nowrap`: em tabela, a coluna só reserva a
                        largura que o conteúdo exige. A deixar os botões
                        partir, a coluna encolhia e eles ficavam em duas filas
                        assim que outra linha entrava em edição. */}
                    <div className="mt-2 flex flex-wrap gap-2 lg:mt-0 lg:flex-nowrap lg:justify-end lg:whitespace-nowrap">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={ocupado || ultimoAdmin}
                        title={
                          ultimoAdmin
                            ? "Tem de existir sempre um administrador ativo."
                            : undefined
                        }
                        onClick={() =>
                          void alterarPapel(
                            user,
                            user.role === "admin" ? "distributor" : "admin",
                          )
                        }
                      >
                        {user.role === "admin"
                          ? "Tornar distribuidor"
                          : "Tornar administrador"}
                      </Button>

                      <Button
                        type="button"
                        variant={user.isActive ? "danger" : "secondary"}
                        disabled={ocupado || (user.isActive && ultimoAdmin)}
                        onClick={() => void alterarAtivo(user, !user.isActive)}
                      >
                        {user.isActive ? "Desativar" : "Reativar"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
