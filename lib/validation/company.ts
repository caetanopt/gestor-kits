import { z } from "zod";
import { stockSchema } from "./delivery";

export const companyNameSchema = z
  .string()
  .trim()
  .min(1, "Indique o nome da empresa.")
  .max(120, "O nome é demasiado longo (máximo 120 caracteres).");

export const companyCodeSchema = z
  .string()
  .trim()
  .min(1, "Indique o código da empresa.")
  .max(40, "O código é demasiado longo (máximo 40 caracteres).")
  .regex(
    /^[\p{L}\p{N}._-]+$/u,
    "O código só pode conter letras, números, ponto, hífen e underscore.",
  );

export const allocatedKitsSchema = z
  .number({ message: "Indique o número de kits atribuídos." })
  .int("O número de kits tem de ser inteiro.")
  .min(0, "O número de kits não pode ser negativo.")
  .max(1_000_000, "O número de kits é implausível.");

/**
 * O código é opcional.
 *
 * Continua a existir na base de dados — é a chave estável que a importação
 * usa para identificar a empresa mesmo quando o nome muda — mas quem cria a
 * empresa não tem de o inventar: é derivado do nome em
 * `public.derive_company_code`.
 */
export const companyInputSchema = z.object({
  name: companyNameSchema,
  code: companyCodeSchema.optional(),
  allocatedKits: allocatedKitsSchema,
});

export const companyResultSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  allocatedKits: z.number().int().nonnegative(),
  stock: stockSchema,
});

/** Linha da vista `company_stock`, já em camelCase. */
export const companyStockRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  allocated: z.number().int().nonnegative(),
  delivered: z.number().int().nonnegative(),
  available: z.number().int().nonnegative(),
  employeeCount: z.number().int().nonnegative(),
});

export type CompanyInput = z.infer<typeof companyInputSchema>;
export type CompanyResult = z.infer<typeof companyResultSchema>;
export type CompanyStockRow = z.infer<typeof companyStockRowSchema>;
