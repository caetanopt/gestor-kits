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

export const stockSchema = z.object({
  allocated: z.number().int().nonnegative(),
  delivered: z.number().int().nonnegative(),
  available: z.number().int().nonnegative(),
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
  stock: stockSchema,
  delivery: deliveryInfoSchema.nullable(),
});

export const deliveryResultSchema = z.object({
  delivery: deliveryInfoSchema,
  employee: employeeSummarySchema,
  company: companySummarySchema,
  stock: stockSchema,
  repeated: z.boolean(),
});

export const reverseResultSchema = z.object({
  deliveryId: z.string().uuid(),
  employeeId: z.string().uuid(),
  stock: stockSchema,
});

export type Stock = z.infer<typeof stockSchema>;
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
