"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { clientEnv } from "@/lib/env";

/** Cliente Supabase do browser. Usado apenas para autenticação. */
export function createSupabaseBrowserClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = clientEnv();
  return createBrowserClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
