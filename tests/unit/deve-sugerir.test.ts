import { describe, expect, it } from "vitest";
import { deveSugerir } from "@/lib/validation/delivery";

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
