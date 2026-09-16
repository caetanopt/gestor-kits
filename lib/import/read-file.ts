import "server-only";
import { readSheet } from "read-excel-file/node";
import { parseCsv } from "./csv";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 20_000;

// "PK\x03\x04": um .xlsx é um arquivo ZIP.
const XLSX_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

/** O ficheiro é mesmo um xlsx? Decidido pelos bytes, não pela extensão. */
export function looksLikeXlsx(buffer: Buffer): boolean {
  return XLSX_SIGNATURE.every((byte, index) => buffer[index] === byte);
}

/**
 * Lê um ficheiro de importação como matriz de células de texto.
 *
 * O formato é decidido pela assinatura binária e não pela extensão nem pelo
 * MIME declarado pelo cliente — ambos são controlados por quem envia.
 *
 * De um ficheiro Excel lê-se a primeira folha.
 */
export async function readImportFile(file: File): Promise<string[][]> {
  const buffer = Buffer.from(await file.arrayBuffer());

  if (looksLikeXlsx(buffer)) {
    // readSheet devolve os dados de uma folha; o export por omissão de
    // read-excel-file@9 devolveria todas as folhas.
    const rows = await readSheet(buffer);
    return rows.map((row) => row.map(cellToText));
  }

  return parseCsv(buffer.toString("utf8"));
}

/**
 * Converte uma célula do Excel em texto.
 *
 * Nota sobre zeros à esquerda: se a coluna do número de colaborador estiver
 * formatada como número, o Excel guarda `12345` e o `012345` original é
 * irrecuperável aqui. A interface de importação avisa disso.
 */
function cellToText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString();
  return String(cell).trim();
}
