import { describe, expect, it } from "vitest";
import { companyInputSchema, deriveCode } from "@/lib/validation/company";

/**
 * `deriveCode` espelha `public.derive_company_code`. Os casos abaixo são os
 * mesmos verificados contra PostgreSQL em tests/sql/run-tests.sh, para que as
 * duas implementações não divirjam sem dar por isso.
 */
describe("deriveCode", () => {
  const casos: [string, string][] = [
    ["Empresa A", "EMPRESAA"],
    ["Águas de Portugal", "AGUASDEPORTU"],
    ["Sonae MC", "SONAEMC"],
    ["José & Filhos, Lda.", "JOSEFILHOSLD"],
    ["123", "123"],
    ["•••", "EMPRESA"],
    ["", "EMPRESA"],
  ];

  for (const [nome, esperado] of casos) {
    it(`"${nome}" → ${esperado}`, () => {
      expect(deriveCode(nome)).toBe(esperado);
    });
  }

  it("nunca excede 12 caracteres", () => {
    expect(deriveCode("Uma Empresa Com Nome Muito Comprido")).toHaveLength(12);
  });
});

describe("companyInputSchema", () => {
  it("aceita a empresa sem código", () => {
    const r = companyInputSchema.safeParse({ name: "Caetano Tec", allocatedKits: 80 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.code).toBeUndefined();
  });

  it("aceita a empresa com código", () => {
    const r = companyInputSchema.safeParse({
      name: "Caetano Tec",
      code: "CTEC",
      allocatedKits: 80,
    });
    expect(r.success && r.data.code).toBe("CTEC");
  });

  it("continua a rejeitar um código com caracteres inválidos", () => {
    expect(
      companyInputSchema.safeParse({ name: "X", code: "A B", allocatedKits: 1 }).success,
    ).toBe(false);
  });
});
