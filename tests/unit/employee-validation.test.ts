import { describe, expect, it } from "vitest";
import { employeeInputSchema } from "@/lib/validation/employee";

const base = {
  employeeNumber: "12345",
  name: "João Silva",
  companyId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
};

/** `base` sem email; `completo` é o mínimo aceite. */
const completo = { ...base, email: "joao@empresa.pt" };

describe("employeeInputSchema", () => {
  it("aceita um colaborador sem email", () => {
    // O email voltou a ser opcional: nem todas as empresas entregam listas
    // com email. Ausente, vazio e só espaços são a mesma coisa — null.
    for (const entrada of [base, { ...base, email: "" }, { ...base, email: "   " }]) {
      const r = employeeInputSchema.safeParse(entrada);
      expect(r.success).toBe(true);
      expect(r.success && r.data.email).toBeNull();
    }
  });

  it("mas continua a recusar um email mal escrito", () => {
    // Um campo vazio é uma escolha; um "joao@empresa" é um erro que ninguém
    // ia notar depois de gravado.
    for (const mau of ["joao@empresa", "joao", "@empresa.pt", "joao@.pt"]) {
      expect(employeeInputSchema.safeParse({ ...base, email: mau }).success).toBe(false);
    }
  });

  it("aceita um colaborador com email", () => {
    const r = employeeInputSchema.safeParse({ ...base, email: "joao@empresa.pt" });
    expect(r.success && r.data.email).toBe("joao@empresa.pt");
  });

  it("normaliza o email para minúsculas", () => {
    const r = employeeInputSchema.safeParse({ ...base, email: "Joao@Empresa.PT" });
    expect(r.success && r.data.email).toBe("joao@empresa.pt");
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
    const semEmpresa: Record<string, unknown> = { ...completo };
    delete semEmpresa["companyId"];
    expect(employeeInputSchema.safeParse(semEmpresa).success).toBe(false);
    expect(
      employeeInputSchema.safeParse({ ...completo, companyId: "não-é-uuid" }).success,
    ).toBe(false);
  });

  it("exige número e nome", () => {
    expect(employeeInputSchema.safeParse({ ...base, employeeNumber: "  " }).success).toBe(
      false,
    );
    expect(employeeInputSchema.safeParse({ ...base, name: "  " }).success).toBe(false);
  });
});
