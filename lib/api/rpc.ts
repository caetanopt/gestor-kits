import type { PostgrestError } from "@supabase/supabase-js";
import { AppError, ERROR_CODES, type ErrorCode } from "./errors";

/**
 * Traduz um erro do PostgREST num AppError.
 *
 * As funções de negócio sinalizam falhas com `raise exception` cuja mensagem
 * é o código de erro estável (ver `public.app_error`). Qualquer outra coisa é
 * um erro inesperado: registamo-lo no servidor e devolvemos INTERNAL_ERROR,
 * para não expor detalhes internos ao cliente.
 */
export function mapPostgrestError(error: PostgrestError): AppError {
  const message = error.message?.trim() ?? "";

  if (message in ERROR_CODES) {
    return new AppError(message as ErrorCode);
  }

  console.error("[rpc] erro inesperado da base de dados", {
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
  return new AppError("INTERNAL_ERROR");
}
