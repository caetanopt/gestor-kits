import { describe, expect, it, vi, afterEach } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { mapPostgrestError } from "@/lib/api/rpc";

function pgError(message: string, code = "P0001"): PostgrestError {
  const error = {
    message,
    code,
    details: "",
    hint: "",
    name: "PostgrestError",
  };
  return { ...error, toJSON: () => error };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mapPostgrestError", () => {
  it("converte um código de negócio lançado pelo SQL", () => {
    const mapped = mapPostgrestError(pgError("ALREADY_DELIVERED"));
    expect(mapped.code).toBe("ALREADY_DELIVERED");
    expect(mapped.status).toBe(409);
    expect(mapped.message).toBe("Este colaborador já recebeu um kit.");
  });

  it("reconhece INACTIVE_ACCOUNT e EMPLOYEE_NOT_FOUND", () => {
    expect(mapPostgrestError(pgError("INACTIVE_ACCOUNT")).code).toBe("INACTIVE_ACCOUNT");
    expect(mapPostgrestError(pgError("EMPLOYEE_NOT_FOUND")).status).toBe(404);
  });

  it("uma recusa de sessão da base de dados é 401, não 500", () => {
    // As funções de distribuição têm execute revogado a anon, por isso um
    // pedido sem sessão nem chega a correr a função e não traz um código de
    // negócio. Sem este ramo, o operador via "o servidor respondeu de forma
    // inesperada" quando o que aconteceu foi a sessão acabar.
    const negado = mapPostgrestError(
      pgError("permission denied for function search_employees_for_delivery", "42501"),
    );
    expect(negado.code).toBe("UNAUTHENTICATED");
    expect(negado.status).toBe(401);

    for (const code of ["PGRST301", "PGRST302"]) {
      expect(mapPostgrestError(pgError("JWT expired", code)).status).toBe(401);
    }
  });

  it("um código que a aplicação já não conhece diz que falta uma migração", () => {
    // Aconteceu a sério: o email deixou de ser obrigatório na aplicação, o
    // código EMPLOYEE_EMAIL_REQUIRED saiu do catálogo e a base de dados
    // ainda estava na versão anterior. A importação falhava com "Ocorreu um
    // erro inesperado", que não diz a ninguém o que fazer a seguir.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mapped = mapPostgrestError(pgError("EMPLOYEE_EMAIL_REQUIRED"));
    expect(mapped.code).toBe("DB_OUT_OF_DATE");
    expect(mapped.details).toEqual([
      expect.stringContaining("EMPLOYEE_EMAIL_REQUIRED"),
    ]);
  });

  it("uma mensagem livre da base de dados não passa por código de aplicação", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const message of [
      'relation "public.employees" does not exist',
      "DEADLOCK detected while waiting",
      "AB",
    ]) {
      expect(mapPostgrestError(pgError(message)).code).toBe("INTERNAL_ERROR");
    }
  });

  it("não expõe detalhes internos de erros inesperados", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mapped = mapPostgrestError(
      pgError('relation "public.segredos" does not exist'),
    );
    expect(mapped.code).toBe("INTERNAL_ERROR");
    expect(mapped.message).not.toContain("segredos");
  });
});
