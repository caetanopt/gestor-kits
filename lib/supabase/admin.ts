import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { clientEnv } from "@/lib/env";

/**
 * Cliente com service role: ignora o RLS por completo.
 *
 * Existe para uma única finalidade — criar contas de utilizador, que só a API
 * de administração do Supabase Auth permite. Nenhuma outra parte da aplicação
 * o usa: toda a restante autorização assenta em RLS e em funções
 * SECURITY DEFINER com a sessão de quem faz o pedido.
 *
 * É opcional. Sem SUPABASE_SERVICE_ROLE_KEY configurada, a aplicação funciona
 * na íntegra e apenas a criação de contas pela interface fica indisponível;
 * as contas criam-se então no painel do Supabase. É deliberado: obrigar a
 * guardar uma chave que contorna toda a segurança só para uma comodidade
 * seria má troca.
 */
export function createSupabaseAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) return null;

  const { NEXT_PUBLIC_SUPABASE_URL } = clientEnv();

  return createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
