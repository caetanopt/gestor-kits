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

  it("mapeia cada código para o estado esperado", () => {
    const esperado: Record<ErrorCode, number> = {
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      INACTIVE_ACCOUNT: 403,
      EMPLOYEE_NOT_FOUND: 404,
      COMPANY_NOT_FOUND: 404,
      DELIVERY_NOT_FOUND: 404,
      ALREADY_DELIVERED: 409,
      ALREADY_REVERSED: 409,
      NO_STOCK: 409,
      DUPLICATE_COMPANY_CODE: 409,
      DUPLICATE_EMPLOYEE_NUMBER: 409,
      LIMIT_BELOW_DELIVERED: 409,
      VALIDATION_ERROR: 422,
      SEARCH_TOO_SHORT: 422,
      INVALID_FILE: 422,
      INVALID_COMPANY: 422,
      EMPLOYEE_EMAIL_REQUIRED: 422,
      USER_NOT_FOUND: 404,
      LAST_ADMIN: 409,
      DUPLICATE_USER_EMAIL: 409,
      USER_CREATION_UNAVAILABLE: 501,
      INTERNAL_ERROR: 500,
    };

    for (const [code, status] of Object.entries(esperado)) {
      expect(new AppError(code as ErrorCode).status, code).toBe(status);
    }
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
