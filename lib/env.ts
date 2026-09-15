import { z } from "zod";

/**
 * Validação de variáveis de ambiente.
 *
 * As variáveis do servidor são validadas de forma preguiçosa (na primeira
 * utilização) para que `next build` não falhe em ambientes onde os segredos
 * só existem em runtime. A mensagem de erro identifica sempre a variável em
 * falta pelo nome.
 */

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY é obrigatória no servidor."),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL tem de ser um URL válido."),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY é obrigatória."),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

function format(error: z.ZodError): string {
  return error.issues.map((issue) => `  - ${issue.message}`).join("\n");
}

let cachedServerEnv: ServerEnv | null = null;

/** Variáveis exclusivas do servidor. Nunca chamar a partir do browser. */
export function serverEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      `Configuração de ambiente inválida (servidor):\n${format(parsed.error)}`,
    );
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

let cachedClientEnv: ClientEnv | null = null;

/**
 * Variáveis públicas. Têm de ser lidas literalmente de `process.env` para que
 * o Next.js as consiga substituir no bundle do cliente.
 */
export function clientEnv(): ClientEnv {
  if (cachedClientEnv) return cachedClientEnv;

  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!parsed.success) {
    throw new Error(`Configuração de ambiente inválida:\n${format(parsed.error)}`);
  }

  cachedClientEnv = parsed.data;
  return cachedClientEnv;
}
