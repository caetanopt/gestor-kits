import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/api/errors";
import { mapPostgrestError } from "@/lib/api/rpc";
import { analyseRows, type ImportIssue } from "@/lib/import/rows";
import { MAX_IMPORT_ROWS } from "@/lib/import/read-file";

export type ImportReport = {
  totalDataRows: number;
  toCreate: number;
  alreadyExists: ImportIssue[];
  duplicatesInFile: ImportIssue[];
  issues: ImportIssue[];
  preview: {
    employeeNumber: string;
    name: string;
    email: string | null;
    companyName: string;
  }[];
  committed: boolean;
  inserted: number;
  skipped: number;
};

const importResultSchema = z.object({
  inserted: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

/**
 * Analisa um ficheiro de colaboradores e, opcionalmente, importa-o.
 *
 * Com `commit: false` devolve o relatório sem escrever nada — é o que
 * alimenta a pré-visualização. A escrita propriamente dita é feita por
 * `public.import_employees`, numa única transação.
 */
export async function importEmployees(input: {
  rows: string[][];
  commit: boolean;
}): Promise<ImportReport> {
  if (input.rows.length === 0) {
    throw new AppError("INVALID_FILE", {
      details: ["O ficheiro está vazio."],
    });
  }
  if (input.rows.length - 1 > MAX_IMPORT_ROWS) {
    throw new AppError("INVALID_FILE", {
      details: [`O ficheiro tem mais de ${MAX_IMPORT_ROWS} linhas de dados.`],
    });
  }

  const supabase = await createSupabaseServerClient();

  const { data: companyRows, error: companyError } = await supabase
    .from("companies")
    .select("id, name, code");
  if (companyError) throw mapPostgrestError(companyError);

  const analysis = analyseRows(input.rows, companyRows ?? []);

  const totalDataRows = Math.max(input.rows.length - 1, 0);

  // Cabeçalho inválido: não vale a pena continuar.
  if (analysis.candidates.length === 0 && analysis.issues.length > 0) {
    return {
      totalDataRows,
      toCreate: 0,
      alreadyExists: [],
      duplicatesInFile: analysis.duplicatesInFile,
      issues: analysis.issues,
      preview: [],
      committed: false,
      inserted: 0,
      skipped: 0,
    };
  }

  // Quais destes números já existem? Uma única consulta, não uma por linha.
  const numbers = analysis.candidates.map((c) => c.employeeNumber);
  const existingKeys = new Set<string>();

  for (let i = 0; i < numbers.length; i += 500) {
    const chunk = numbers.slice(i, i + 500).map((n) => n.toUpperCase());
    const { data, error } = await supabase
      .from("employees")
      .select("employee_number_key")
      .in("employee_number_key", chunk);
    if (error) throw mapPostgrestError(error);
    for (const row of data ?? []) existingKeys.add(row.employee_number_key);
  }

  const alreadyExists: ImportIssue[] = [];

  const toInsert = analysis.candidates.filter((candidate) => {
    // A chave na base de dados é `upper(btrim(employee_number))`; comparamos
    // exatamente por essa forma, não pela normalização mais agressiva usada
    // para cabeçalhos e nomes de empresa.
    const dbKey = candidate.employeeNumber.trim().toUpperCase();
    if (existingKeys.has(dbKey)) {
      alreadyExists.push({
        line: candidate.line,
        message: `O colaborador ${candidate.employeeNumber} já existe e foi ignorado.`,
      });
      return false;
    }
    return true;
  });

  const report: ImportReport = {
    totalDataRows,
    toCreate: toInsert.length,
    alreadyExists,
    duplicatesInFile: analysis.duplicatesInFile,
    issues: analysis.issues,
    preview: toInsert.slice(0, 10).map((c) => ({
      employeeNumber: c.employeeNumber,
      name: c.name,
      email: c.email,
      companyName: c.companyName,
    })),
    committed: false,
    inserted: 0,
    skipped: 0,
  };

  if (!input.commit || toInsert.length === 0) return report;

  const { data, error } = await supabase.rpc("import_employees", {
    p_rows: toInsert.map((c) => ({
      employeeNumber: c.employeeNumber,
      name: c.name,
      email: c.email,
      companyId: c.companyId,
    })),
  });
  if (error) throw mapPostgrestError(error);

  const parsed = importResultSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[rpc] resposta inesperada de import_employees", parsed.error.issues);
    throw new AppError("INTERNAL_ERROR");
  }

  return {
    ...report,
    committed: true,
    inserted: parsed.data.inserted,
    skipped: parsed.data.skipped,
  };
}
