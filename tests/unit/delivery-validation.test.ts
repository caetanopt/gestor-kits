import { describe, expect, it } from "vitest";
import {
  deliveryRequestSchema,
  employeeNumberSchema,
  employeeLookupSchema,
} from "@/lib/validation/delivery";

describe("employeeNumberSchema", () => {
  it("aceita números simples", () => {
    expect(employeeNumberSchema.parse("12345")).toBe("12345");
  });

  it("remove espaços à volta", () => {
    expect(employeeNumberSchema.parse("  12345  ")).toBe("12345");
  });

  it("aceita prefixos alfanuméricos e separadores comuns", () => {
    for (const value of ["EMP-123", "A.45", "12/99", "X_7"]) {
      expect(employeeNumberSchema.safeParse(value).success, value).toBe(true);
    }
  });

  it("rejeita um número vazio", () => {
    expect(employeeNumberSchema.safeParse("   ").success).toBe(false);
  });

  it("rejeita caracteres que não pertencem a um número de colaborador", () => {
    for (const value of ["12 345", "'; drop table employees; --", "<script>", "12%"]) {
      expect(employeeNumberSchema.safeParse(value).success, value).toBe(false);
    }
  });

  it("rejeita números absurdamente longos", () => {
    expect(employeeNumberSchema.safeParse("9".repeat(41)).success).toBe(false);
  });
});

describe("deliveryRequestSchema", () => {
  it("exige uma chave de idempotência em formato UUID", () => {
    expect(
      deliveryRequestSchema.safeParse({
        employeeNumber: "12345",
        idempotencyKey: "não-é-uuid",
      }).success,
    ).toBe(false);

    expect(
      deliveryRequestSchema.safeParse({
        employeeNumber: "12345",
        idempotencyKey: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      }).success,
    ).toBe(true);
  });
});

describe("employeeLookupSchema", () => {
  const valid = {
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
    totals: { delivered: 47, employees: 120 },
    delivery: null,
  };

  it("aceita a resposta esperada da função SQL", () => {
    expect(employeeLookupSchema.parse(valid).company.name).toBe("Empresa A");
  });

  it("rejeita contagens negativas vindas da base de dados", () => {
    const corrupted = {
      ...valid,
      totals: { delivered: -1, employees: 10 },
    };
    expect(employeeLookupSchema.safeParse(corrupted).success).toBe(false);
  });

  it("rejeita uma resposta a que falte a empresa", () => {
    const withoutCompany: Record<string, unknown> = { ...valid };
    delete withoutCompany["company"];
    expect(employeeLookupSchema.safeParse(withoutCompany).success).toBe(false);
  });
});
