import { AppError } from "@/lib/api/errors";
import { mapPostgrestError } from "@/lib/api/rpc";

/**
 * Lê TODAS as linhas de uma consulta, página a página.
 *
 * O Supabase corta cada resposta em `max_rows` (1000 por defeito, e é o que
 * está em supabase/config.toml). Pedir um `range` maior não adianta: o teto é
 * do servidor e a resposta vem truncada sem erro nenhum. Foi assim que a
 * exportação chegou a sair com 1000 colaboradores quando havia 2589.
 *
 * Duas escolhas que tornam isto à prova de surpresas:
 *
 *   - **Por identificador, não por posição.** Cada página pede as linhas com
 *     `id` maior do que o último lido (`depoisDe`). Com `offset`, um
 *     colaborador acrescentado a meio da exportação deslocava as páginas
 *     seguintes e alguém saía repetido ou em falta.
 *
 *   - **Só pára numa página vazia.** Parar quando uma página vem mais curta
 *     do que o pedido parece equivalente, mas falha se o servidor tiver um
 *     teto mais baixo do que `tamanho`: a primeira página vinha "curta" e a
 *     leitura acabava ali. Custa um pedido a mais, pequeno.
 *
 * `maximo` é uma rede de segurança contra um ciclo sem fim, não um corte: se
 * for ultrapassado, é um erro, nunca um ficheiro truncado em silêncio.
 */
export async function lerTodasAsPaginas<T, Id extends string | number>(
  pagina: (
    depoisDe: Id | null,
    tamanho: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: Parameters<typeof mapPostgrestError>[0] | null;
  }>,
  idDe: (linha: T) => Id,
  { tamanho = 1000, maximo = 100_000 }: { tamanho?: number; maximo?: number } = {},
): Promise<T[]> {
  const todas: T[] = [];
  let depoisDe: Id | null = null;

  for (;;) {
    const { data, error } = await pagina(depoisDe, tamanho);
    if (error) throw mapPostgrestError(error);

    const linhas = data ?? [];
    if (linhas.length === 0) return todas;

    todas.push(...linhas);
    if (todas.length > maximo) {
      throw new AppError("INTERNAL_ERROR", {
        details: [`A leitura passou de ${maximo} linhas e foi interrompida.`],
      });
    }

    const ultimo = idDe(linhas[linhas.length - 1] as T);
    // Um servidor que devolvesse sempre a mesma página faria isto girar para
    // sempre; o identificador tem de avançar.
    if (depoisDe !== null && ultimo <= depoisDe) {
      throw new AppError("INTERNAL_ERROR", {
        details: ["A leitura por páginas não avançou."],
      });
    }
    depoisDe = ultimo;
  }
}
