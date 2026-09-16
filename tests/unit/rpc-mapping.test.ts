import { describe, expect, it, vi, afterEach } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { mapPostgrestError } from "@/lib/api/rpc";

function pgError(message: string): PostgrestError {
  const error = {
    message,
    code: "P0001",
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

  it("não expõe detalhes internos de erros inesperados", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mapped = mapPostgrestError(
      pgError('relation "public.segredos" does not exist'),
    );
    expect(mapped.code).toBe("INTERNAL_ERROR");
    expect(mapped.message).not.toContain("segredos");
  });
});
