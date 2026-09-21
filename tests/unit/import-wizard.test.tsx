import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportWizard } from "@/components/admin/import-wizard";
import { MAX_IMPORT_BYTES } from "@/lib/import/limites";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => vi.restoreAllMocks());

/** Seleciona um ficheiro e carrega em "Analisar ficheiro". */
async function analisar() {
  const user = userEvent.setup();
  render(<ImportWizard hasCompanies />);
  const ficheiro = new File(["numero,nome,empresa\n1,Ana,EA\n"], "colaboradores.csv", {
    type: "text/csv",
  });
  await user.upload(screen.getByLabelText(/ficheiro de colaboradores/i), ficheiro);
  await user.click(screen.getByRole("button", { name: "Analisar ficheiro" }));
}

describe("o limite do ficheiro cabe no que a plataforma aceita", () => {
  it("fica abaixo dos 4,5 MB que o Vercel impõe", () => {
    // Acima disso, o pedido morre com 413 FUNCTION_PAYLOAD_TOO_LARGE antes de
    // chegar ao nosso código, e a interface não tem nada de útil para dizer.
    // O limite é da infraestrutura e não se configura.
    expect(MAX_IMPORT_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });
});

describe("falhas de envio", () => {
  it("falta de rede manda verificar a rede", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    await analisar();

    expect(await screen.findByRole("alert")).toHaveTextContent("Sem ligação ao servidor");
  });

  it("um ficheiro grande demais diz que é o ficheiro, não a rede", async () => {
    // O 413 do Vercel é uma página de erro, não o nosso envelope JSON: sem
    // este ramo, aparecia "sem ligação ao servidor" e mandava-se o
    // administrador procurar um problema de rede que não existe.
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          status: 413,
          json: () => Promise.reject(new SyntaxError("não é JSON")),
        } as unknown as Response),
      ),
    );
    await analisar();

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("ficheiro é grande demais");
    expect(aviso).not.toHaveTextContent("Sem ligação");
  });

  it("qualquer outra resposta sem JSON mostra o código HTTP", async () => {
    // O número é o que permite distinguir um 504 de um 500 sem adivinhar.
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          status: 504,
          json: () => Promise.reject(new SyntaxError("não é JSON")),
        } as unknown as Response),
      ),
    );
    await analisar();

    expect(await screen.findByRole("alert")).toHaveTextContent("(504)");
  });

  it("um erro nosso continua a mostrar a mensagem que o servidor mandou", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          status: 422,
          json: () =>
            Promise.resolve({
              success: false,
              code: "INVALID_FILE",
              message: "O ficheiro enviado é inválido ou está corrompido.",
              details: ["Não foi possível ler o ficheiro. Verifique o formato."],
            }),
        } as unknown as Response),
      ),
    );
    await analisar();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível ler o ficheiro",
    );
  });

  it("o caminho feliz continua a mostrar a pré-visualização", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                totalDataRows: 1,
                toCreate: 1,
                alreadyExists: [],
                duplicatesInFile: [],
                issues: [],
                preview: [
                  {
                    employeeNumber: "1",
                    name: "Ana",
                    email: null,
                    companyName: "Empresa A",
                  },
                ],
                committed: false,
                inserted: 0,
                skipped: 0,
              },
            }),
        } as unknown as Response),
      ),
    );
    await analisar();

    await waitFor(() => expect(screen.getByText("Pré-visualização")).toBeInTheDocument());
  });
});
