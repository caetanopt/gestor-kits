import { NextResponse } from "next/server";
import { AppError, type ErrorCode, messageFor } from "./errors";

/** Envelope de sucesso. */
export type ApiSuccess<T> = { success: true; data: T };

/** Envelope de erro. */
export type ApiFailure = {
  success: false;
  code: ErrorCode;
  message: string;
  details?: unknown;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ success: true, data } as const, init);
}

export function fail(
  code: ErrorCode,
  options?: { status?: number; details?: unknown },
): NextResponse<ApiFailure> {
  const error = new AppError(code, options);
  const body: ApiFailure = {
    success: false,
    code,
    message: messageFor(code),
  };
  if (error.details !== null) body.details = error.details;
  return NextResponse.json(body, { status: error.status });
}

/**
 * Converte qualquer erro apanhado num Route Handler numa resposta HTTP.
 * Erros inesperados são registados no servidor e devolvidos como
 * INTERNAL_ERROR, sem expor detalhes internos ao cliente.
 */
export function toErrorResponse(error: unknown): NextResponse<ApiFailure> {
  if (error instanceof AppError) {
    return fail(error.code, { status: error.status, details: error.details });
  }
  console.error("[api] erro não tratado:", error);
  return fail("INTERNAL_ERROR");
}
