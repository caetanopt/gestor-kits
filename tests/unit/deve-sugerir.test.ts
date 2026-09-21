import { describe, expect, it } from "vitest";
import { correspondenciaUnicaPorEmail, deveSugerir } from "@/lib/validation/delivery";

/**
 * Estas regras espelham `public.search_employees_for_delivery`. Se divergirem,
 * o cliente faz pedidos que voltam vazios, ou deixa de fazer pedidos que
 * teriam resultado.
 */
describe("deveSugerir", () => {
  it("não sugere enquanto não houver um espaço", () => {
    for (const termo of ["A", "An", "Ana", "Ana"]) {
      expect(deveSugerir(termo), termo).toBe(false);
    }
  });

  it("sugere assim que aparece o primeiro espaço", () => {
    expect(deveSugerir("Ana ")).toBe(true);
    expect(deveSugerir("Ana C")).toBe(true);
    expect(deveSugerir("Ana Costa")).toBe(true);
  });

  it("espaços à esquerda não contam como o primeiro espaço", () => {
    expect(deveSugerir("   ")).toBe(false);
    expect(deveSugerir("  Ana")).toBe(false);
    expect(deveSugerir("  Ana ")).toBe(true);
  });

  it("sugere para um email completo, mesmo sem espaço", () => {
    expect(deveSugerir("ana.costa@empresa.pt")).toBe(true);
    expect(deveSugerir("  ana.costa@empresa.pt  ")).toBe(true);
  });

  it("não sugere para um email incompleto", () => {
    for (const termo of ["ana", "ana@", "ana@empresa", "@empresa.pt"]) {
      expect(deveSugerir(termo), termo).toBe(false);
    }
  });
});

describe("correspondenciaUnicaPorEmail", () => {
  const match = {
    id: "3f2504e0-4f89-41d3-9a0c-0305e82c3310",
    employeeNumber: "12345",
    name: "João Silva",
    companyName: "Empresa A",
    kitDelivered: false,
    email: null as string | null,
  };

  it("um só resultado com email é correspondência única", () => {
    const search = {
      results: [{ ...match, email: "joao@empresa.pt" }],
      total: 1,
      truncated: false,
    };
    expect(correspondenciaUnicaPorEmail(search)?.employeeNumber).toBe("12345");
  });

  it("um só resultado sem email não é: a pesquisa foi por nome", () => {
    const search = { results: [match], total: 1, truncated: false };
    expect(correspondenciaUnicaPorEmail(search)).toBeNull();
  });

  it("dois colaboradores com o mesmo email mostram a lista", () => {
    const search = {
      results: [
        { ...match, email: "geral@empresa.pt" },
        {
          ...match,
          id: "3f2504e0-4f89-41d3-9a0c-0305e82c3311",
          email: "geral@empresa.pt",
        },
      ],
      total: 2,
      truncated: false,
    };
    expect(correspondenciaUnicaPorEmail(search)).toBeNull();
  });

  it("nenhum resultado não é correspondência", () => {
    expect(
      correspondenciaUnicaPorEmail({ results: [], total: 0, truncated: false }),
    ).toBeNull();
  });
});

describe("o espaço sozinho não abre a pesquisa", () => {
  it("uma letra e um espaço já não sugere", () => {
    // Era assim que se percorria a base toda sem acesso à tabela: "a " devolvia
    // dez nomes, e variando a letra chegava-se a toda a gente.
    expect(deveSugerir("a ")).toBe(false);
    expect(deveSugerir("o ")).toBe(false);
    expect(deveSugerir("ab ")).toBe(false);
  });

  it("uma pesquisa de balcão a sério continua a sugerir", () => {
    expect(deveSugerir("Ana ")).toBe(true);
    expect(deveSugerir("Miguel ")).toBe(true);
    expect(deveSugerir("Zé S")).toBe(true);
    expect(deveSugerir("Daniela Espanhol")).toBe(true);
  });

  it("e o email continua a valer por si, seja qual for o tamanho", () => {
    expect(deveSugerir("a@b.pt")).toBe(true);
  });
});
