import { describe, expect, it } from "vitest";
import { AppError, ERROR_CODES, messageFor, type ErrorCode } from "@/lib/api/errors";

describe("AppError", () => {
  it("mapeia cada código para um estado HTTP conhecido", () => {
    const codes = Object.keys(ERROR_CODES) as ErrorCode[];
    for (const code of codes) {
      const error = new AppError(code);
      expect(error.status, `código ${code}`).toBeGreaterThanOrEqual(400);
      expect(error.status, `código ${code}`).toBeLessThan(600);
    }
  });

  it("usa 409 para conflitos de estado", () => {
    expect(new AppError("ALREADY_DELIVERED").status).toBe(409);
    expect(new AppError("NO_STOCK").status).toBe(409);
  });

  it("usa 404 quando o recurso não existe", () => {
    expect(new AppError("EMPLOYEE_NOT_FOUND").status).toBe(404);
  });

  it("permite sobrepor o estado", () => {
    expect(new AppError("NO_STOCK", { status: 400 }).status).toBe(400);
  });

  it("expõe a mensagem em pt-PT", () => {
    expect(messageFor("EMPLOYEE_NOT_FOUND")).toBe("Colaborador não encontrado.");
    expect(new AppError("ALREADY_DELIVERED").message).toBe(
      "Este colaborador já recebeu um kit.",
    );
  });
});
