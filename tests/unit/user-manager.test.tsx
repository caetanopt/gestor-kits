import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserManager } from "@/components/admin/user-manager";
import type { UserRow } from "@/lib/validation/user";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const SEM_NOME: UserRow = {
  id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  email: "miguel.msantos@caetano.pt",
  name: "",
  role: "admin",
  isActive: true,
  createdAt: "2026-09-01T09:00:00.000Z",
};

const COM_NOME: UserRow = {
  id: "3f2504e0-4f89-41d3-9a0c-0305e82c3302",
  email: "ana.costa@caetano.pt",
  name: "Ana Costa",
  role: "distributor",
  isActive: true,
  createdAt: "2026-09-01T09:00:00.000Z",
};

let pedidos: { url: string; method: string; body: unknown }[] = [];

beforeEach(() => {
  pedidos = [];
  refresh.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      pedidos.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, data: {} }),
      } as Response);
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("gestão de contas", () => {
  it("assinala a conta cujo nome está por preencher", () => {
    // É a conta que continua a mostrar o email no cabeçalho, e esta é a
    // página onde isso se resolve.
    render(
      <UserManager users={[SEM_NOME, COM_NOME]} currentUserId={SEM_NOME.id} canCreate />,
    );
    expect(screen.getByText(/sem nome — aparece o email no topo/)).toBeInTheDocument();
  });

  it("altera o nome de uma conta existente", async () => {
    const user = userEvent.setup();
    render(
      <UserManager users={[SEM_NOME, COM_NOME]} currentUserId={SEM_NOME.id} canCreate />,
    );

    // O nome acessível inclui o email: com várias linhas, "Editar nome"
    // sozinho não diria qual delas.
    await user.click(
      screen.getByRole("button", { name: `Editar nome de ${SEM_NOME.email}` }),
    );

    const campo = screen.getByLabelText(`Nome de ${SEM_NOME.email}`);
    await user.type(campo, "  Miguel Santos  ");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());

    expect(pedidos).toEqual([
      {
        url: `/api/admin/users/${SEM_NOME.id}`,
        method: "PATCH",
        // Sem espaços em volta: o nome vai para o cabeçalho tal como fica.
        body: { name: "Miguel Santos" },
      },
    ]);
  });

  it("não envia um nome só com espaços ao servidor", async () => {
    // `required` trava o campo vazio, mas aceita espaços — e um nome de
    // espaços mostraria uma etiqueta em branco no cabeçalho.
    const user = userEvent.setup();
    render(<UserManager users={[COM_NOME]} currentUserId={SEM_NOME.id} canCreate />);

    await user.click(
      screen.getByRole("button", { name: `Editar nome de ${COM_NOME.email}` }),
    );
    const campo = screen.getByLabelText(`Nome de ${COM_NOME.email}`);
    await user.clear(campo);
    await user.type(campo, "   ");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(pedidos).toEqual([]);
    expect(screen.getByText("Indique o nome.")).toBeInTheDocument();
  });

  it("a nova conta leva nome, e o campo é obrigatório", async () => {
    const user = userEvent.setup();
    render(<UserManager users={[]} currentUserId={SEM_NOME.id} canCreate />);

    await user.click(screen.getByRole("button", { name: "Nova conta" }));
    expect(screen.getByLabelText(/^Nome/)).toBeRequired();

    await user.type(screen.getByLabelText(/^Email/), "novo@caetano.pt");
    await user.type(screen.getByLabelText(/^Nome/), "Pessoa Nova");
    await user.type(screen.getByLabelText(/^Palavra-passe/), "12345678");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(pedidos[0]).toEqual({
      url: "/api/admin/users",
      method: "POST",
      body: {
        email: "novo@caetano.pt",
        fullName: "Pessoa Nova",
        password: "12345678",
        role: "distributor",
      },
    });
  });

  it("sem service role, explica onde criar as contas", () => {
    render(
      <UserManager users={[COM_NOME]} currentUserId={SEM_NOME.id} canCreate={false} />,
    );
    expect(screen.queryByRole("button", { name: "Nova conta" })).not.toBeInTheDocument();
    expect(screen.getByText(/SUPABASE_SERVICE_ROLE_KEY/)).toBeInTheDocument();
  });
});
