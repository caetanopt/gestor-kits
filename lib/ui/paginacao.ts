/**
 * Contas de uma listagem paginada.
 *
 * Vive à parte da página por serem contas com muitos limites a errar por um:
 * o primeiro registo é 1 e não 0, o último da página final não é um múltiplo
 * do tamanho, e uma lista vazia não tem zero páginas mas uma.
 */
export type Paginacao = {
  /** Quantas páginas, no mínimo uma mesmo sem registos. */
  pageCount: number;
  /** Número do primeiro e do último registo desta página, a contar de 1. */
  primeiro: number;
  ultimo: number;
  temAnterior: boolean;
  temSeguinte: boolean;
  /** A página pedida fica para lá do fim — tipicamente um endereço guardado. */
  foraDeAlcance: boolean;
};

export function paginar(total: number, pagina: number, porPagina: number): Paginacao {
  const pageCount = Math.max(1, Math.ceil(total / porPagina));
  const foraDeAlcance = total > 0 && pagina >= pageCount;

  // Numa página vazia não há intervalo a mostrar; zeros dizem-no sem mentir.
  const primeiro = total === 0 || foraDeAlcance ? 0 : pagina * porPagina + 1;
  const ultimo = primeiro === 0 ? 0 : Math.min(total, (pagina + 1) * porPagina);

  return {
    pageCount,
    primeiro,
    ultimo,
    temAnterior: pagina > 0,
    temSeguinte: pagina + 1 < pageCount,
    foraDeAlcance,
  };
}
