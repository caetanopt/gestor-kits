import type { ExportedEmployee } from "@/lib/validation/delivery";
import type { ColaboradorManual } from "@/lib/employees/manuais";

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
 * Resumo por empresa, a partir das mesmas linhas que vão no documento.
 *
 * Calculado aqui e não com uma consulta à parte de propósito: um total que
 * venha de outro sítio pode não bater certo com a lista logo acima dele, e
 * um resumo que contradiz o detalhe é pior do que não ter resumo.
 */
function resumoPorEmpresa(pessoas: readonly ExportedEmployee[]) {
  const porEmpresa = new Map<string, { total: number; comKit: number }>();

  for (const p of pessoas) {
    const linha = porEmpresa.get(p.companyName) ?? { total: 0, comKit: 0 };
    linha.total += 1;
    if (p.kitDelivered) linha.comKit += 1;
    porEmpresa.set(p.companyName, linha);
  }

  return [...porEmpresa.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-PT"));
}

/**
 * Documento dos colaboradores.
 *
 * Fica aqui, e não dentro do route handler, para poder ser exercitado sem um
 * servidor e uma sessão: as colunas, a ordem e os totais são precisamente o
 * que quem recebe o ficheiro vai ler.
 *
 * A lista vem primeiro para que a linha 1 seja o cabeçalho — é o que permite
 * ordenar e filtrar no Excel sem mexer no ficheiro. O resumo vai no fim,
 * separado por uma linha em branco, onde se chega com Ctrl+End.
 *
 * `formatarData` é injetada porque a formatação de datas depende do fuso e
 * vive noutro módulo; passá-la mantém este ficheiro sem dependências.
 */
export function colaboradoresParaCsv(
  pessoas: readonly ExportedEmployee[],
  formatarData: (iso: string) => string,
): string {
  const resumo = resumoPorEmpresa(pessoas);
  const totalGeral = pessoas.length;
  const comKitGeral = pessoas.filter((p) => p.kitDelivered).length;

  return toCsv([
    [
      "Empresa",
      "N.º colaborador",
      "Nome",
      "Email",
      "Kit entregue",
      "Data de entrega",
      "Entregue por",
    ],
    ...pessoas.map((p) => [
      p.companyName,
      p.employeeNumber,
      p.name,
      // Um colaborador sem email deixa a célula vazia, não um "null".
      p.email ?? "",
      p.kitDelivered ? "Sim" : "Não",
      p.deliveredAt ? formatarData(p.deliveredAt) : "",
      p.deliveredByName ?? "",
    ]),

    [],
    ["Resumo"],
    ["Empresa", "Colaboradores", "Entregues", "Sem entrega"],
    ...resumo.map(([empresa, { total, comKit }]) => [
      empresa,
      String(total),
      String(comKit),
      String(total - comKit),
    ]),
    ["Total", String(totalGeral), String(comKitGeral), String(totalGeral - comKitGeral)],
  ]);
}

const ORIGENS: Record<ColaboradorManual["origem"], string> = {
  distribuicao: "Balcão de distribuição",
  colaboradores: "Página Colaboradores",
};

/**
 * Documento dos colaboradores acrescentados à mão.
 *
 * Mesmas regras do documento geral (delimitador, BOM, fórmulas neutralizadas)
 * e mais três colunas que só fazem sentido aqui: quando, por quem e onde a
 * pessoa foi acrescentada. O total vai no fim, depois de uma linha em branco.
 */
export function colaboradoresManuaisParaCsv(
  pessoas: readonly ColaboradorManual[],
  formatarData: (iso: string) => string,
): string {
  return toCsv([
    [
      "N.º colaborador",
      "Nome",
      "Email",
      "Empresa",
      "Acrescentado em",
      "Acrescentado por",
      "Onde",
      "Kit entregue",
      "Data de entrega",
      "Entregue por",
    ],
    ...pessoas.map((p) => [
      p.employeeNumber,
      p.name,
      p.email ?? "",
      p.companyName,
      formatarData(p.createdAt),
      p.createdByName ?? "",
      ORIGENS[p.origem],
      p.kitDelivered ? "Sim" : "Não",
      p.deliveredAt ? formatarData(p.deliveredAt) : "",
      p.deliveredByName ?? "",
    ]),
    [],
    ["Total", String(pessoas.length)],
  ]);
}
