import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DistributionScreen } from "@/components/distribution/distribution-screen";
import type { EmployeeLookup } from "@/lib/validation/delivery";

const LOOKUP: EmployeeLookup = {
  employee: {
    id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    employeeNumber: "12345",
    name: "João Silva",
  },
  company: {
    id: "3f2504e0-4f89-41d3-9a0c-0305e82c3302",
    name: "Empresa A",
    code: "EMPA",
  },
  stock: { allocated: 120, delivered: 47, available: 73 },
  delivery: null,
};

const DELIVERED: EmployeeLookup = {
  ...LOOKUP,
  employee: { ...LOOKUP.employee, employeeNumber: "12346", name: "Ana Costa" },
  delivery: {
    id: "3f2504e0-4f89-41d3-9a0c-0305e82c3303",
    deliveredAt: "2026-09-15T10:30:00.000Z",
    deliveredBy: { id: "3f2504e0-4f89-41d3-9a0c-0305e82c3304", name: "Bruno Operador" },
    reversedAt: null,
  },
};

/** Regista as chamadas para podermos afirmar o que NÃO foi chamado. */
let calls: { url: string; method: string }[] = [];

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET" });
      return Promise.resolve({
        json: () => Promise.resolve(handler(url, init)),
      } as Response);
    }),
  );
}

beforeEach(() => {
  calls = [];
  vi.stubGlobal("crypto", {
    ...globalThis.crypto,
    randomUUID: () => "3f2504e0-4f89-41d3-9a0c-0305e82c3399",
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const deliveries = () => calls.filter((c) => c.url === "/api/deliveries");
const searches = () => calls.filter((c) => c.url.startsWith("/api/employees/search"));

const RESULTADOS = {
  results: [
    {
      id: "3f2504e0-4f89-41d3-9a0c-0305e82c3310",
      employeeNumber: "12345",
      name: "João Silva",
      companyName: "Empresa A",
      kitDelivered: false,
      email: null,
    },
  ],
  total: 1,
  truncated: false,
};

describe("ecrã de distribuição", () => {
  it("pesquisa com Enter e mostra o colaborador", async () => {
    const user = userEvent.setup();
    mockFetch(() => ({ success: true, data: LOOKUP }));

    render(<DistributionScreen />);
    await user.keyboard("12345{Enter}");

    expect(await screen.findByText("João Silva")).toBeInTheDocument();
    expect(screen.getByText(/N.º 12345/)).toBeInTheDocument();
    expect(screen.getByText("KIT AINDA NÃO ENTREGUE")).toBeInTheDocument();
  });

  it("entrega com Enter quando o campo está vazio", async () => {
    const user = userEvent.setup();
    mockFetch((url) =>
      url === "/api/deliveries"
        ? {
            success: true,
            data: {
              delivery: {
                id: "3f2504e0-4f89-41d3-9a0c-0305e82c3305",
                deliveredAt: "2026-09-15T11:00:00.000Z",
                deliveredBy: {
                  id: "3f2504e0-4f89-41d3-9a0c-0305e82c3304",
                  name: "Bruno",
                },
                reversedAt: null,
              },
              employee: LOOKUP.employee,
              company: LOOKUP.company,
              stock: { allocated: 120, delivered: 48, available: 72 },
              repeated: false,
            },
          }
        : { success: true, data: LOOKUP },
    );

    render(<DistributionScreen />);
    await user.keyboard("12345{Enter}");
    await screen.findByText("João Silva");

    await user.keyboard("{Enter}");

    expect(await screen.findByText("Kit entregue com sucesso.")).toBeInTheDocument();
    expect(screen.getByText(/72 kits ainda disponíveis/)).toBeInTheDocument();
    expect(deliveries()).toHaveLength(1);
  });

  it("uma leitura de crachá com o cartão aberto pesquisa, NUNCA entrega", async () => {
    // O cenário perigoso: o operador tem o cartão do João aberto e alguém
    // passa o crachá da Ana pelo leitor, que envia "12346" seguido de Enter.
    const user = userEvent.setup();
    mockFetch((url) =>
      url.includes("12346")
        ? { success: true, data: DELIVERED }
        : { success: true, data: LOOKUP },
    );

    render(<DistributionScreen />);
    await user.keyboard("12345{Enter}");
    await screen.findByText("João Silva");

    // Leitura do crachá seguinte, sem qualquer clique pelo meio.
    await user.keyboard("12346{Enter}");

    expect(await screen.findByText("Ana Costa")).toBeInTheDocument();
    expect(deliveries()).toHaveLength(0);
  });

  it("bloqueia o botão e explica quando o kit já foi entregue", async () => {
    const user = userEvent.setup();
    mockFetch(() => ({ success: true, data: DELIVERED }));

    render(<DistributionScreen />);
    await user.keyboard("12346{Enter}");

    expect(await screen.findByText("JÁ ENTREGUE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ENTREGAR KIT" })).toBeDisabled();
    expect(screen.getByText(/Bruno Operador/)).toBeInTheDocument();

    // Enter com o campo vazio também não pode entregar.
    await user.keyboard("{Enter}");
    expect(deliveries()).toHaveLength(0);
  });

  it("bloqueia a entrega quando a empresa esgotou o stock", async () => {
    const user = userEvent.setup();
    mockFetch(() => ({
      success: true,
      data: { ...LOOKUP, stock: { allocated: 120, delivered: 120, available: 0 } },
    }));

    render(<DistributionScreen />);
    await user.keyboard("12345{Enter}");

    expect(await screen.findByText("STOCK ESGOTADO")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ENTREGAR KIT" })).toBeDisabled();

    await user.keyboard("{Enter}");
    expect(deliveries()).toHaveLength(0);
  });

  it("mostra a mensagem do servidor quando o colaborador não existe", async () => {
    const user = userEvent.setup();
    mockFetch(() => ({
      success: false,
      code: "EMPLOYEE_NOT_FOUND",
      message: "Colaborador não encontrado.",
    }));

    render(<DistributionScreen />);
    await user.keyboard("00000{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Colaborador não encontrado.",
    );
  });

  it("limpa o campo e devolve o foco depois de cada pesquisa", async () => {
    const user = userEvent.setup();
    mockFetch(() => ({ success: true, data: LOOKUP }));

    render(<DistributionScreen />);
    const input = screen.getByLabelText("Número de colaborador");

    await user.keyboard("12345{Enter}");
    await screen.findByText("João Silva");

    await waitFor(() => {
      expect(input).toHaveValue("");
      expect(input).toHaveFocus();
    });
  });

  it("Esc limpa o resultado", async () => {
    const user = userEvent.setup();
    mockFetch(() => ({ success: true, data: LOOKUP }));

    render(<DistributionScreen />);
    await user.keyboard("12345{Enter}");
    await screen.findByText("João Silva");

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByText("João Silva")).not.toBeInTheDocument();
    });
  });

  it("reutiliza a chave de idempotência em pedidos repetidos da mesma pesquisa", async () => {
    const user = userEvent.setup();
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method ?? "GET" });
        if (init?.body) bodies.push(String(init.body));
        return Promise.resolve({
          json: () =>
            Promise.resolve(
              url === "/api/deliveries"
                ? {
                    success: false,
                    code: "NO_STOCK",
                    message: "A empresa já atingiu o limite de kits.",
                  }
                : { success: true, data: LOOKUP },
            ),
        } as Response);
      }),
    );

    render(<DistributionScreen />);
    await user.keyboard("12345{Enter}");
    await screen.findByText("João Silva");

    await user.click(screen.getByRole("button", { name: "ENTREGAR KIT" }));
    await screen.findByRole("alert");

    const parsed = JSON.parse(bodies[0] ?? "{}") as { idempotencyKey?: string };
    expect(parsed.idempotencyKey).toBe("3f2504e0-4f89-41d3-9a0c-0305e82c3399");
  });
});

describe("pesquisa por nome ou email", () => {
  async function abrirSeparador(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("tab", { name: "Nome ou email" }));
    return screen.getByLabelText("Nome ou email");
  }

  it("não pergunta ao servidor antes do primeiro espaço", async () => {
    const user = userEvent.setup();
    mockFetch(() => ({ success: true, data: RESULTADOS }));

    render(<DistributionScreen />);
    const campo = await abrirSeparador(user);
    await user.type(campo, "Ana");

    await waitFor(() => {
      expect(
        screen.getByText(/Escreva o nome próprio seguido de um espaço/),
      ).toBeInTheDocument();
    });
    expect(searches()).toHaveLength(0);
  });

  it("sugere assim que aparece o espaço", async () => {
    const user = userEvent.setup();
    mockFetch(() => ({ success: true, data: RESULTADOS }));

    render(<DistributionScreen />);
    const campo = await abrirSeparador(user);
    await user.type(campo, "João ");

    expect(await screen.findByText("João Silva")).toBeInTheDocument();
    expect(searches().length).toBeGreaterThan(0);
  });

  it("pergunta ao servidor para um email completo, sem espaço", async () => {
    const user = userEvent.setup();
    mockFetch(() => ({
      success: true,
      data: { ...RESULTADOS, results: [{ ...RESULTADOS.results[0]!, email: "a@b.pt" }] },
    }));

    render(<DistributionScreen />);
    const campo = await abrirSeparador(user);
    await user.type(campo, "joao.silva@empresa.pt");

    expect(await screen.findByText("João Silva")).toBeInTheDocument();
  });

  it("escolher um resultado abre o cartão e o Enter seguinte entrega", async () => {
    const user = userEvent.setup();
    mockFetch((url) => {
      if (url.startsWith("/api/employees/search")) {
        return { success: true, data: RESULTADOS };
      }
      if (url === "/api/deliveries") {
        return {
          success: true,
          data: {
            delivery: {
              id: "3f2504e0-4f89-41d3-9a0c-0305e82c3305",
              deliveredAt: "2026-09-16T11:00:00.000Z",
              deliveredBy: { id: "3f2504e0-4f89-41d3-9a0c-0305e82c3304", name: "B" },
              reversedAt: null,
            },
            employee: LOOKUP.employee,
            company: LOOKUP.company,
            stock: { allocated: 120, delivered: 48, available: 72 },
            repeated: false,
          },
        };
      }
      return { success: true, data: LOOKUP };
    });

    render(<DistributionScreen />);
    const campo = await abrirSeparador(user);
    await user.type(campo, "João ");

    await user.click(await screen.findByText("João Silva"));
    await screen.findByText("KIT AINDA NÃO ENTREGUE");

    await user.keyboard("{Enter}");
    expect(await screen.findByText("Kit entregue com sucesso.")).toBeInTheDocument();
  });

  it("uma leitura de crachá no separador de nome NUNCA entrega", async () => {
    const user = userEvent.setup();
    mockFetch((url) =>
      url.startsWith("/api/employees/search")
        ? { success: true, data: RESULTADOS }
        : { success: true, data: LOOKUP },
    );

    render(<DistributionScreen />);
    const campo = await abrirSeparador(user);
    await user.type(campo, "João ");
    await user.click(await screen.findByText("João Silva"));
    await screen.findByText("KIT AINDA NÃO ENTREGUE");

    // O crachá seguinte: dígitos e Enter, sem clique pelo meio.
    await user.keyboard("12346{Enter}");
    expect(deliveries()).toHaveLength(0);
  });

  it("mudar de separador limpa o que estava no ecrã", async () => {
    const user = userEvent.setup();
    mockFetch(() => ({ success: true, data: LOOKUP }));

    render(<DistributionScreen />);
    await user.keyboard("12345{Enter}");
    await screen.findByText("João Silva");

    await abrirSeparador(user);

    await waitFor(() => {
      expect(screen.queryByText("KIT AINDA NÃO ENTREGUE")).not.toBeInTheDocument();
    });
  });
});
