/**
 * Limites da importação de colaboradores.
 *
 * Num módulo próprio, sem `server-only`, porque a interface também precisa
 * deles: um ficheiro grande demais deve ser recusado no browser, antes de uma
 * viagem que vai morrer na mesma.
 */

/**
 * Tamanho máximo do ficheiro.
 *
 * 4 MB e não 5: o Vercel recusa qualquer pedido com mais de 4,5 MB de corpo,
 * com um 413 FUNCTION_PAYLOAD_TOO_LARGE que nunca chega ao nosso código — é
 * imposto na infraestrutura e não se configura. Um ficheiro entre 4,5 e 5 MB
 * passava a nossa verificação e morria lá fora, e a interface só conseguia
 * dizer "sem ligação ao servidor".
 *
 * A margem até aos 4,5 MB é para a codificação multipart, que acrescenta
 * fronteiras e cabeçalhos ao ficheiro.
 *
 * Para referência: um CSV de 2253 colaboradores tem cerca de 150 KB.
 */
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

export const MAX_IMPORT_ROWS = 20_000;

/** O limite em MB, para mensagens. */
export const MAX_IMPORT_MB = Math.round(MAX_IMPORT_BYTES / 1024 / 1024);
