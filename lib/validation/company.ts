import { z } from "zod";
import { totalsSchema } from "./delivery";

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
});

export const companyResultSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  totals: totalsSchema,
});

/** Linha da vista `company_totals`, já em camelCase. */
export const companyTotalsRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  delivered: z.number().int().nonnegative(),
  employeeCount: z.number().int().nonnegative(),
});

export type CompanyInput = z.infer<typeof companyInputSchema>;
export type CompanyResult = z.infer<typeof companyResultSchema>;
export type CompanyTotalsRow = z.infer<typeof companyTotalsRowSchema>;

/**
 * Pré-visualização do código que o servidor vai gerar a partir do nome.
 *
 * Espelha `public.derive_company_code`. Serve apenas para mostrar o valor no
 * campo como sugestão — quem decide é sempre o SQL, que é também quem garante
 * a unicidade.
 */
export function deriveCode(name: string): string {
  const semAcentos = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  return semAcentos.slice(0, 12) || "EMPRESA";
}
