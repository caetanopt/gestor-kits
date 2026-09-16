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

/** Analisa um URL sem lançar exceção. */
function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * URL do projeto Supabase.
 *
 * Normalizado de propósito. Uma barra final — que é o que acontece quando se
 * copia o URL da barra de endereços do browser — faz a biblioteca construir
 * `https://projeto.supabase.co//auth/v1/token`, e o gateway responde
 * `404 Invalid path specified in request URL`. Do lado da aplicação isso
 * aparece como um login que falha sempre, sem explicação nenhuma.
 *
 * Um caminho a mais (por exemplo `/rest/v1`) provoca o mesmo erro, mas não se
 * corrige sozinho: esse é rejeitado com uma mensagem que diz o que fazer.
 *
 * As verificações estão num `superRefine` e não em `refine` encadeados porque
 * o Zod executa todos os `refine`: com um valor que nem sequer é URL, o
 * segundo rebentaria com um TypeError em vez da mensagem útil.
 */
const supabaseUrlSchema = z
  .string({ message: "NEXT_PUBLIC_SUPABASE_URL é obrigatória." })
  .trim()
  .min(1, "NEXT_PUBLIC_SUPABASE_URL é obrigatória.")
  .transform((value) => value.replace(/\/+$/, ""))
  .superRefine((value, ctx) => {
    const url = parseUrl(value);

    if (!url) {
      ctx.addIssue({
        code: "custom",
        message:
          "NEXT_PUBLIC_SUPABASE_URL tem de ser um URL completo, por exemplo https://abcdefg.supabase.co",
      });
      return;
    }

    if (url.protocol !== "https:") {
      ctx.addIssue({
        code: "custom",
        message: "NEXT_PUBLIC_SUPABASE_URL tem de começar por https://",
      });
      return;
    }

    if (url.pathname !== "/") {
      ctx.addIssue({
        code: "custom",
        message:
          "NEXT_PUBLIC_SUPABASE_URL não pode incluir caminho. Use apenas https://abcdefg.supabase.co",
      });
    }
  });

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrlSchema,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string({ message: "NEXT_PUBLIC_SUPABASE_ANON_KEY é obrigatória." })
    .trim()
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
