import { z } from "zod";

/**
 * Validação de variáveis de ambiente.
 *
 * A aplicação só precisa das duas variáveis públicas do Supabase. Não existe
 * nenhum segredo de servidor: toda a autorização é feita pelo RLS e por
 * funções SECURITY DEFINER, invocadas com a sessão do próprio utilizador.
 * Não há, por isso, nenhuma utilização da chave service_role.
 *
 * A validação é preguiçosa (na primeira utilização) para que `next build` não
 * falhe em ambientes onde a configuração só existe em runtime. A mensagem de
 * erro identifica sempre a variável em falta pelo nome.
 */

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL tem de ser um URL válido."),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY é obrigatória."),
});

export type ClientEnv = z.infer<typeof clientSchema>;

function format(error: z.ZodError): string {
  return error.issues.map((issue) => `  - ${issue.message}`).join("\n");
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
