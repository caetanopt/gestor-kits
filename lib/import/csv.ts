/**
 * Leitor de CSV.
 *
 * Escrito à mão em vez de trazer uma dependência: o que precisamos é pouco,
 * mas tem de lidar bem com o que o Excel português produz na prática.
 *
 *  - BOM UTF-8 no início do ficheiro (o Excel escreve-o quase sempre);
 *  - separador `;` — é o predefinido do Excel em Portugal, porque a vírgula
 *    é o separador decimal;
 *  - terminadores CRLF, LF e CR;
 *  - campos entre aspas com separadores, aspas duplicadas e quebras de linha
 *    lá dentro (RFC 4180).
 */

const DELIMITERS = [",", ";", "\t", "|"] as const;
export type Delimiter = (typeof DELIMITERS)[number];

/** Remove o BOM UTF-8, se existir. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Deteta o separador pela primeira linha não vazia, ignorando o que esteja
 * dentro de aspas. Ganha o candidato com mais ocorrências; em empate, a
 * ordem de DELIMITERS decide (vírgula primeiro).
 */
export function detectDelimiter(text: string): Delimiter {
  const line = firstLogicalLine(stripBom(text));

  let best: Delimiter = ",";
  let bestCount = 0;

  for (const candidate of DELIMITERS) {
    const count = countOutsideQuotes(line, candidate);
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  return best;
}

function firstLogicalLine(text: string): string {
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') i += 1;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && (char === "\n" || char === "\r")) {
      return text.slice(0, i);
    }
  }
  return text;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') i += 1;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && char === delimiter) {
      count += 1;
    }
  }
  return count;
}

/**
 * Converte texto CSV numa matriz de células.
 * Linhas completamente vazias são descartadas.
 */
export function parseCsv(input: string, delimiter?: Delimiter): string[][] {
  const text = stripBom(input);
  const sep = delimiter ?? detectDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = "";
  };

  const endRow = () => {
    endField();
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        // Aspas duplicadas dentro de um campo entre aspas: uma aspa literal.
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") {
      inQuotes = true;
    } else if (char === sep) {
      endField();
    } else if (char === "\n") {
      endRow();
    } else if (char === "\r") {
      // CRLF conta como um único fim de linha.
      if (text[i + 1] === "\n") i += 1;
      endRow();
    } else {
      field += char;
    }
  }

  // Último campo, se o ficheiro não terminar em quebra de linha.
  if (field !== "" || row.length > 0) endRow();

  return rows;
}
