import "server-only";
import { createClient } from "@supabase/supabase-js";
import { clientEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env";

/**
 * Cliente com service role: ignora RLS.
 *
 * Usar apenas em operações administrativas já autorizadas no servidor
 * (criação de contas, importação em lote). Nunca importar em código
 * de cliente.
 */
export function createSupabaseAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL } = clientEnv();
  const { SUPABASE_SERVICE_ROLE_KEY } = serverEnv();

  return createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
