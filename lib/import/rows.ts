import { employeeNumberSchema } from "@/lib/validation/delivery";

/**
 * Normalização e validação das linhas de um ficheiro de importação.
 *
 * A especificação (secção 19) descreve o formato
 * `employee_number,name,company` mas, na prática, os ficheiros vêm de folhas
 * de cálculo mantidas por pessoas: cabeçalhos em português, com acentos,
 * maiúsculas inconsistentes e espaços. Aceitamos essas variações em vez de
 * obrigar o administrador a reformatar o ficheiro durante o evento.
 */

/** Minúsculas, sem acentos e sem pontuação — para comparar cabeçalhos e nomes. */
export function normaliseKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

type Column = "employeeNumber" | "name" | "company" | "companyCode";

const HEADER_ALIASES: Record<string, Column> = {};

function alias(column: Column, ...names: string[]) {
  for (const name of names) HEADER_ALIASES[normaliseKey(name)] = column;
}

alias(
  "employeeNumber",
  "employee_number",
  "employeenumber",
  "numero",
  "n",
  "no",
  "num",
  "numero colaborador",
  "numero de colaborador",
  "n colaborador",
  "nº colaborador",
  "n.º colaborador",
  "numero funcionario",
  "numero de funcionario",
  "matricula",
);
alias("name", "name", "nome", "nome colaborador", "nome do colaborador", "nome completo");
alias("company", "company", "empresa", "nome empresa", "nome da empresa");
alias("companyCode", "company_code", "companycode", "codigo", "codigo empresa", "sigla");

export type HeaderMap = Partial<Record<Column, number>>;

/** Faz corresponder os cabeçalhos do ficheiro às colunas que conhecemos. */
export function mapHeaders(header: string[]): HeaderMap {
  const map: HeaderMap = {};
  header.forEach((cell, index) => {
    const column = HEADER_ALIASES[normaliseKey(cell)];
    if (column && map[column] === undefined) map[column] = index;
  });
  return map;
}

export type CompanyRef = { id: string; name: string; code: string };

export type ImportIssue = { line: number; message: string };

export type ImportCandidate = {
  line: number;
  employeeNumber: string;
  name: string;
  companyId: string;
  companyName: string;
};

export type ImportAnalysis = {
  headerMap: HeaderMap;
  candidates: ImportCandidate[];
  duplicatesInFile: ImportIssue[];
  issues: ImportIssue[];
};

/**
 * Valida e normaliza as linhas de dados.
 *
 * `line` é o número da linha no ficheiro original (1 = cabeçalho), para que
 * o administrador consiga localizar cada erro na folha de cálculo.
 */
export function analyseRows(rows: string[][], companies: CompanyRef[]): ImportAnalysis {
  const header = rows[0] ?? [];
  const headerMap = mapHeaders(header);

  const issues: ImportIssue[] = [];
  const duplicatesInFile: ImportIssue[] = [];
  const candidates: ImportCandidate[] = [];

  if (headerMap.employeeNumber === undefined) {
    issues.push({
      line: 1,
      message:
        "Não foi encontrada a coluna do número de colaborador. Cabeçalhos aceites: employee_number, numero, n.º colaborador.",
    });
  }
  if (headerMap.name === undefined) {
    issues.push({
      line: 1,
      message: "Não foi encontrada a coluna do nome. Cabeçalhos aceites: name, nome.",
    });
  }
  if (headerMap.company === undefined && headerMap.companyCode === undefined) {
    issues.push({
      line: 1,
      message:
        "Não foi encontrada a coluna da empresa. Cabeçalhos aceites: company, empresa, codigo.",
    });
  }
  if (issues.length > 0) {
    return { headerMap, candidates, duplicatesInFile, issues };
  }

  // Índices para resolver a empresa por código ou por nome, ambos
  // insensíveis a acentos, maiúsculas e espaços.
  const byCode = new Map(companies.map((c) => [normaliseKey(c.code), c]));
  const byName = new Map(companies.map((c) => [normaliseKey(c.name), c]));

  const seen = new Map<string, number>();

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const line = index + 1;

    const cell = (column: Column): string => {
      const at = headerMap[column];
      return at === undefined ? "" : (row[at] ?? "").trim();
    };

    const rawNumber = cell("employeeNumber");
    const rawName = cell("name");
    const rawCompany = cell("company");
    const rawCode = cell("companyCode");

    if (!rawNumber && !rawName && !rawCompany && !rawCode) continue;

    const number = employeeNumberSchema.safeParse(rawNumber);
    if (!number.success) {
      issues.push({
        line,
        message: `Número de colaborador inválido${rawNumber ? ` ("${rawNumber}")` : ""}: ${
          number.error.issues[0]?.message ?? "valor inválido"
        }`,
      });
      continue;
    }

    if (!rawName) {
      issues.push({ line, message: `Falta o nome do colaborador ${number.data}.` });
      continue;
    }
    if (rawName.length > 160) {
      issues.push({ line, message: `O nome na linha ${line} é demasiado longo.` });
      continue;
    }

    // O código tem prioridade sobre o nome: é estável, o nome não.
    const company =
      (rawCode ? byCode.get(normaliseKey(rawCode)) : undefined) ??
      (rawCompany ? byName.get(normaliseKey(rawCompany)) : undefined) ??
      (rawCompany ? byCode.get(normaliseKey(rawCompany)) : undefined);

    if (!company) {
      const shown = rawCode || rawCompany || "(vazio)";
      issues.push({
        line,
        message: `Empresa desconhecida: "${shown}". Crie a empresa antes de importar.`,
      });
      continue;
    }

    // Duplicados dentro do próprio ficheiro.
    const key = normaliseKey(number.data);
    const firstSeenAt = seen.get(key);
    if (firstSeenAt !== undefined) {
      duplicatesInFile.push({
        line,
        message: `Número ${number.data} repetido no ficheiro (já aparece na linha ${firstSeenAt}).`,
      });
      continue;
    }
    seen.set(key, line);

    candidates.push({
      line,
      employeeNumber: number.data,
      name: rawName,
      companyId: company.id,
      companyName: company.name,
    });
  }

  return { headerMap, candidates, duplicatesInFile, issues };
}
