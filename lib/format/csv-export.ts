import type { DeliveredPerson } from "@/lib/validation/delivery";

/**
 * Geração de CSV para abrir no Excel.
 *
 * Duas decisões que parecem detalhe e não são:
 *
 *   - **Delimitador `;`.** O Excel em português lê um ficheiro separado por
 *     vírgulas como uma coluna só. O `;` é o que a versão pt-PT espera, e é
 *     também o que a nossa própria importação aceita (ver `detectDelimiter`).
 *
 *   - **BOM no início.** Sem ele, o Excel assume a codificação do sistema e
 *     "João" aparece como "JoÃ£o". Três bytes invisíveis que separam um
 *     ficheiro utilizável de um ficheiro que se devolve a pedir outro.
 */
const DELIMITADOR = ";";
const BOM = "﻿";

/**
 * Escapa um valor.
 *
 * As aspas são o mecanismo do formato: um valor com delimitador, aspas ou
 * quebra de linha vai entre aspas, e as aspas interiores duplicam-se.
 */
function escapar(valor: string): string {
  // Um valor que comece por =, +, - ou @ é interpretado como fórmula pelo
  // Excel ao abrir o ficheiro. Prefixar com apóstrofo neutraliza-o sem
  // alterar o que se lê na célula.
  const seguro = /^[=+\-@]/.test(valor) ? `'${valor}` : valor;

  if (!/["\n\r;]/.test(seguro)) return seguro;
  return `"${seguro.replace(/"/g, '""')}"`;
}

/**
 * Linhas para texto CSV. A primeira linha é o cabeçalho, como qualquer outra.
 *
 * A quebra de linha é `\r\n` por ser o que o formato define (RFC 4180) e o
 * que o Excel em Windows espera.
 */
export function toCsv(linhas: readonly (readonly string[])[]): string {
  return BOM + linhas.map((l) => l.map(escapar).join(DELIMITADOR)).join("\r\n") + "\r\n";
}

/**
 * Documento das entregas.
 *
 * Fica aqui, e não dentro do route handler, para poder ser exercitado sem um
 * servidor e uma sessão: as colunas e a ordem são precisamente o que quem
 * recebe o ficheiro vai ler.
 *
 * `formatarData` é injetada porque a formatação de datas depende do fuso e
 * vive noutro módulo; passá-la mantém este ficheiro sem dependências.
 */
export function entregasParaCsv(
  pessoas: readonly DeliveredPerson[],
  formatarData: (iso: string) => string,
): string {
  return toCsv([
    ["Empresa", "N.º colaborador", "Nome", "Email", "Data de entrega", "Entregue por"],
    ...pessoas.map((p) => [
      p.companyName,
      p.employeeNumber,
      p.name,
      // Um colaborador sem email deixa a célula vazia, não um "null".
      p.email ?? "",
      p.deliveredAt ? formatarData(p.deliveredAt) : "",
      p.deliveredByName ?? "",
    ]),
  ]);
}
