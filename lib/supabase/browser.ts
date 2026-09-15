"use client";

import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/lib/env";

/** Cliente Supabase do browser. Usado apenas para autenticação. */
export function createSupabaseBrowserClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = clientEnv();
  return createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
