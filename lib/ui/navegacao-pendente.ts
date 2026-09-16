/**
 * Contagem de navegações em curso.
 *
 * Existe para que a barra de progresso no topo seja uma só, no topo da
 * aplicação, sem que cada ligação tenha de saber dela. Cada `ProgressLink`
 * abre uma navegação quando fica pendente e fecha-a quando deixa de estar;
 * a barra observa o total.
 *
 * É uma contagem e não um booleano porque podem existir duas ligações
 * pendentes ao mesmo tempo — clicar numa e, antes de chegar, clicar noutra.
 * Fechar a primeira não pode apagar a barra enquanto a segunda continua.
 *
 * Fica fora do React de propósito: um contexto obrigaria a re-renderizar
 * tudo o que está dentro dele a cada navegação, quando o único elemento que
 * muda é uma linha de três pixels.
 */
let pendentes = 0;
const ouvintes = new Set<() => void>();

function notificar(): void {
  for (const ouvinte of ouvintes) ouvinte();
}

/** Marca uma navegação como em curso. Devolve a função que a termina. */
export function abrirNavegacao(): () => void {
  pendentes += 1;
  notificar();

  let fechada = false;
  return () => {
    // Idempotente: o React pode limpar o mesmo efeito mais do que uma vez em
    // modo estrito, e uma contagem negativa esconderia a barra cedo demais.
    if (fechada) return;
    fechada = true;
    pendentes -= 1;
    notificar();
  };
}

export function haNavegacaoPendente(): boolean {
  return pendentes > 0;
}

export function subscreverNavegacao(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** Só para testes: repõe o estado entre casos. */
export function reporNavegacao(): void {
  pendentes = 0;
  ouvintes.clear();
}
