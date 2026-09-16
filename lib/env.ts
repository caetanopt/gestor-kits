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

/**
 * URL do projeto Supabase.
 *
 * Reduzido à origem (`https://projeto.supabase.co`), descartando barras
 * finais, caminhos, query e fragmento.
 *
 * Isto não é permissividade gratuita: um URL de projeto Supabase é sempre uma
 * origem nua, e qualquer coisa a mais produz pedidos como
 * `https://projeto.supabase.co//auth/v1/token`, a que o gateway responde
 * `404 Invalid path specified in request URL`. Na aplicação isso aparece como
 * um login que falha sempre, sem explicação.
 *
 * A versão anterior desta validação rejeitava esses casos em vez de os
 * corrigir, o que transformava um URL mal copiado numa página de erro 500 —
 * pior do que o problema que resolvia. Só o que não é recuperável (não ser um
 * URL, ou não ser https) continua a ser erro.
 *
 * As verificações estão num `superRefine` e não em `refine` encadeados porque
 * o Zod executa todos os `refine`: com um valor que nem sequer é um URL, o
 * seguinte rebentaria com TypeError em vez da mensagem útil.
 */
const supabaseUrlSchema = z
  .string({ message: "NEXT_PUBLIC_SUPABASE_URL é obrigatória." })
  .trim()
  .min(1, "NEXT_PUBLIC_SUPABASE_URL é obrigatória.")
  .superRefine((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
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
    }
  })
  .transform((value) => new URL(value).origin);

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
