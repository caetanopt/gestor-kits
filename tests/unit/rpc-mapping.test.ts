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

  it("reconhece NO_STOCK e EMPLOYEE_NOT_FOUND", () => {
    expect(mapPostgrestError(pgError("NO_STOCK")).code).toBe("NO_STOCK");
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

  it("não expõe detalhes internos de erros inesperados", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mapped = mapPostgrestError(
      pgError('relation "public.segredos" does not exist'),
    );
    expect(mapped.code).toBe("INTERNAL_ERROR");
    expect(mapped.message).not.toContain("segredos");
  });
});
