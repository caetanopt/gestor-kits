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

  // Falta de sessão, dita pela própria base de dados.
  //
  // As funções de distribuição têm `execute` revogado a `anon`, por isso um
  // pedido sem sessão nem chega a correr a função: o PostgreSQL recusa com
  // 42501. Um token expirado é recusado antes disso pelo PostgREST, com
  // PGRST301/PGRST302. Nos dois casos o que aconteceu foi a sessão acabar, e
  // o operador precisa de o saber em vez de ver um erro interno.
  if (error.code === "42501" || error.code === "PGRST301" || error.code === "PGRST302") {
    return new AppError("UNAUTHENTICATED");
  }

  // Migrações em falta.
  //
  // `public.app_error` levanta sempre P0001 com a mensagem igual ao código.
  // Se o código tem a forma de um código nosso mas não está no catálogo, a
  // base de dados está a correr uma versão anterior das funções — foi o que
  // aconteceu quando o email deixou de ser obrigatório na aplicação antes de
  // a migração 0012 ser aplicada. Dizê-lo é muito mais útil do que "erro
  // inesperado", e a mensagem devolvida continua a ser nossa: só o código,
  // com forma verificada, vem da base de dados.
  if (error.code === "P0001" && /^[A-Z][A-Z0-9_]{2,63}$/.test(message)) {
    console.error("[rpc] código desconhecido devolvido pela base de dados", { message });
    return new AppError("DB_OUT_OF_DATE", {
      details: [
        `A base de dados respondeu "${message}", um código que esta versão da aplicação já não usa. Falta aplicar uma migração.`,
      ],
    });
  }

  console.error("[rpc] erro inesperado da base de dados", {
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
  return new AppError("INTERNAL_ERROR");
}
