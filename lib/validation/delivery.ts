import { z } from "zod";

/**
 * Número de colaborador.
 *
 * Aceita letras e dígitos: há organizações que usam prefixos. A normalização
 * (maiúsculas, sem espaços) acontece na base de dados, através da coluna
 * gerada `employee_number_key`.
 */
export const employeeNumberSchema = z
  .string()
  .trim()
  .min(1, "Indique o número de colaborador.")
  .max(40, "O número de colaborador é demasiado longo.")
  .regex(/^[\p{L}\p{N}._/-]+$/u, "O número de colaborador tem caracteres inválidos.");

export const deliveryRequestSchema = z.object({
  employeeNumber: employeeNumberSchema,
  // Gerada pelo cliente a cada resultado de pesquisa: torna a entrega
  // idempotente perante duplo clique ou retry de rede.
  idempotencyKey: z.string().uuid("Chave de idempotência inválida."),
});

export const reverseRequestSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

/* -------------------------------------------------------------------------
 * Formas devolvidas pelas funções PostgreSQL.
 *
 * As funções devolvem `jsonb`, portanto o TypeScript não tem como saber a
 * forma. Validamos a resposta em vez de a assumir: se o SQL e a aplicação
 * divergirem, falha aqui e não numa página em branco.
 * ---------------------------------------------------------------------- */

/**
 * Contagens de uma empresa.
 *
 * Deixou de haver stock: não há limite por empresa e a entrega nunca é
 * recusada por falta de kits. O que se conta é o que foi entregue, e o total
 * de colaboradores vai junto porque é ele que dá escala à contagem —
 * "48 de 120" diz o que "48" não diz.
 */
export const totalsSchema = z.object({
  delivered: z.number().int().nonnegative(),
  employees: z.number().int().nonnegative(),
});

export const employeeSummarySchema = z.object({
  id: z.string().uuid(),
  employeeNumber: z.string(),
  name: z.string(),
});

export const companySummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string(),
});

export const deliveryInfoSchema = z.object({
  id: z.string().uuid(),
  deliveredAt: z.string(),
  deliveredBy: z.object({ id: z.string().uuid(), name: z.string() }),
  reversedAt: z.string().nullable(),
});

export const employeeLookupSchema = z.object({
  employee: employeeSummarySchema,
  company: companySummarySchema,
  totals: totalsSchema,
  delivery: deliveryInfoSchema.nullable(),
});

export const deliveryResultSchema = z.object({
  delivery: deliveryInfoSchema,
  employee: employeeSummarySchema,
  company: companySummarySchema,
  totals: totalsSchema,
  repeated: z.boolean(),
});

export const reverseResultSchema = z.object({
  deliveryId: z.string().uuid(),
  employeeId: z.string().uuid(),
  totals: totalsSchema,
});

export type Totals = z.infer<typeof totalsSchema>;
export type EmployeeSummary = z.infer<typeof employeeSummarySchema>;
export type CompanySummary = z.infer<typeof companySummarySchema>;
export type DeliveryInfo = z.infer<typeof deliveryInfoSchema>;
export type EmployeeLookup = z.infer<typeof employeeLookupSchema>;
export type DeliveryResult = z.infer<typeof deliveryResultSchema>;
export type ReverseResult = z.infer<typeof reverseResultSchema>;

/** Termo de pesquisa por nome ou email. */
export const searchTermSchema = z
  .string()
  .min(1, "Escreva um nome ou email.")
  .max(160, "O termo de pesquisa é demasiado longo.");

/**
 * Vale a pena pedir sugestões ao servidor para este texto?
 *
 * Espelha as regras de `public.search_employees_for_delivery`, para não fazer
 * pedidos que já se sabe que voltam vazios:
 *
 *   - um email só corresponde quando está completo;
 *   - um nome só sugere depois do primeiro espaço.
 *
 * O `\S\s` é sobre o texto por aparar: "Ana " tem espaço, "Ana" não. É essa a
 * diferença entre estar a escrever e ter escrito.
 */
export function deveSugerir(termo: string): boolean {
  if (/\S\s/.test(termo)) return true;
  return pareceEmail(termo);
}

/**
 * O que foi escrito é um email?
 *
 * Serve para decidir em que campo cai o termo de pesquisa quando a pessoa não
 * está na lista e é preciso acrescentá-la: um email escrito na barra de
 * pesquisa pertence ao campo Email, não ao campo Nome.
 */
export function pareceEmail(termo: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(termo.trim());
}

export const employeeMatchSchema = z.object({
  id: z.string().uuid(),
  employeeNumber: z.string(),
  name: z.string(),
  companyName: z.string(),
  kitDelivered: z.boolean(),
  /** Presente apenas quando foi o email que correspondeu à pesquisa. */
  email: z.string().nullable(),
});

export const employeeSearchSchema = z.object({
  results: z.array(employeeMatchSchema),
  total: z.number().int().nonnegative(),
  truncated: z.boolean(),
  /** Verdadeiro quando ainda falta escrever para haver sugestões. */
  aguarda: z.boolean().optional(),
});

export type EmployeeMatch = z.infer<typeof employeeMatchSchema>;
export type EmployeeSearch = z.infer<typeof employeeSearchSchema>;

/**
 * A pesquisa identificou uma pessoa única pelo email?
 *
 * O email é um identificador: quem o escreve já sabe de quem se trata, e uma
 * lista de um elemento só acrescenta um clique. Nesse caso abrimos o cartão
 * diretamente, como se tivesse sido pesquisado o número.
 *
 * O sinal é o campo `email`: `search_employees_for_delivery` só o preenche
 * quando foi o email que correspondeu — numa pesquisa por nome vem sempre
 * `null`, mesmo que dê um único resultado. É por isso que um nome com uma só
 * correspondência continua a mostrar a lista: quem pesquisou por nome pode
 * ter-se enganado na pessoa, quem escreveu o email não.
 */
export function correspondenciaUnicaPorEmail(
  search: EmployeeSearch,
): EmployeeMatch | null {
  if (search.total !== 1 || search.results.length !== 1) return null;
  const unico = search.results[0];
  return unico && unico.email !== null ? unico : null;
}

/** Um colaborador, tal como sai para o documento exportado. */
export type ExportedEmployee = {
  companyName: string;
  employeeNumber: string;
  name: string;
  email: string | null;
  kitDelivered: boolean;
  deliveredAt: string | null;
  deliveredByName: string | null;
};
