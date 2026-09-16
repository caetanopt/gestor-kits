import { describe, expect, it } from "vitest";
import { employeeInputSchema } from "@/lib/validation/employee";

const base = {
  employeeNumber: "12345",
  name: "João Silva",
  companyId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
};

describe("employeeInputSchema", () => {
  it("aceita um colaborador sem email", () => {
    expect(employeeInputSchema.safeParse(base).success).toBe(true);
  });

  it("aceita um colaborador com email", () => {
    const r = employeeInputSchema.safeParse({ ...base, email: "joao@empresa.pt" });
    expect(r.success && r.data.email).toBe("joao@empresa.pt");
  });

  it("trata o email vazio como ausente", () => {
    const r = employeeInputSchema.safeParse({ ...base, email: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBeUndefined();
  });

  it("remove espaços à volta do email", () => {
    const r = employeeInputSchema.safeParse({ ...base, email: "  joao@empresa.pt  " });
    expect(r.success && r.data.email).toBe("joao@empresa.pt");
  });

  it("rejeita um email malformado", () => {
    for (const email of ["sem-arroba", "a@b", "@empresa.pt", "a b@c.pt"]) {
      expect(employeeInputSchema.safeParse({ ...base, email }).success, email).toBe(
        false,
      );
    }
  });

  it("exige empresa", () => {
    const semEmpresa: Record<string, unknown> = { ...base };
    delete semEmpresa["companyId"];
    expect(employeeInputSchema.safeParse(semEmpresa).success).toBe(false);
    expect(
      employeeInputSchema.safeParse({ ...base, companyId: "não-é-uuid" }).success,
    ).toBe(false);
  });

  it("exige número e nome", () => {
    expect(employeeInputSchema.safeParse({ ...base, employeeNumber: "  " }).success).toBe(
      false,
    );
    expect(employeeInputSchema.safeParse({ ...base, name: "  " }).success).toBe(false);
  });
});
