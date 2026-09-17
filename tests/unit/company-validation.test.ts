import { describe, expect, it } from "vitest";
import { companyInputSchema } from "@/lib/validation/company";

const valid = { name: "Empresa A", code: "EMPA" };

describe("companyInputSchema", () => {
  it("aceita uma empresa válida", () => {
    expect(companyInputSchema.parse(valid).name).toBe("Empresa A");
  });

  it("remove espaços do nome e do código", () => {
    const parsed = companyInputSchema.parse({
      ...valid,
      name: "  Empresa A  ",
      code: " EMPA ",
    });
    expect(parsed.name).toBe("Empresa A");
    expect(parsed.code).toBe("EMPA");
  });

  it("rejeita nome ou código vazios", () => {
    expect(companyInputSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
    expect(companyInputSchema.safeParse({ ...valid, code: "" }).success).toBe(false);
  });

  it("rejeita códigos com caracteres problemáticos", () => {
    for (const code of ["EMP A", "EMP/A", "<b>", "'; --"]) {
      expect(companyInputSchema.safeParse({ ...valid, code }).success, code).toBe(false);
    }
  });
});
