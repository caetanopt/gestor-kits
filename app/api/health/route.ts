import { ok } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * Verificação de saúde.
 *
 * Inclui o identificador do projeto Supabase contra o qual a aplicação está
 * configurada. Não é um segredo — o NEXT_PUBLIC_SUPABASE_URL já viaja no
 * bundle que o browser recebe — e é a forma mais rápida de detetar o erro
 * clássico de configuração: a aplicação a apontar para um projeto diferente
 * daquele que se está a consultar no painel. Nesse caso o login falha sempre,
 * com a base de dados aparentemente impecável.
 *
 * A chave anon é reportada apenas como presente/ausente e pelo comprimento,
 * o suficiente para detetar uma cópia truncada sem a revelar.
 */
export function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  // De "https://abcdefghijklm.supabase.co" extrai "abcdefghijklm".
  const projectRef = /^https:\/\/([^.]+)\.supabase\./.exec(url)?.[1] ?? null;

  return ok({
    status: "ok",
    timestamp: new Date().toISOString(),
    supabase: {
      projectRef,
      urlConfigurado: url !== "",
      urlTemFormatoValido: projectRef !== null,
      anonKeyConfigurada: anonKey !== "",
      anonKeyComprimento: anonKey.length,
    },
    autenticacaoDesativada: Boolean(
      process.env.AUTH_BYPASS_EMAIL && process.env.AUTH_BYPASS_PASSWORD,
    ),
  });
}
