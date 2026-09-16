import { z } from "zod";
import { employeeNumberSchema } from "./delivery";

export const employeeNameSchema = z
  .string()
  .trim()
  .min(1, "Indique o nome do colaborador.")
  .max(160, "O nome é demasiado longo (máximo 160 caracteres).");

/**
 * Email do colaborador.
 *
 * Opcional: nem todos os colaboradores têm email conhecido, e exigi-lo
 * bloquearia importações legítimas. Uma string vazia é tratada como ausente.
 */
export const employeeEmailSchema = z
  .string()
  .trim()
  .max(254, "O email é demasiado longo.")
  .email("Email inválido.")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const employeeInputSchema = z.object({
  employeeNumber: employeeNumberSchema,
  name: employeeNameSchema,
  email: employeeEmailSchema,
  companyId: z.string().uuid("Selecione uma empresa."),
});

export const employeeResultSchema = z.object({
  id: z.string().uuid(),
  employeeNumber: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  companyId: z.string().uuid(),
});

/** Filtros da listagem administrativa. */
export const employeeFilterSchema = z.object({
  q: z.string().trim().max(160).optional(),
  companyId: z.string().uuid().optional(),
  estado: z.enum(["entregue", "por-entregar"]).optional(),
});

export type EmployeeInput = z.infer<typeof employeeInputSchema>;
export type EmployeeResult = z.infer<typeof employeeResultSchema>;
export type EmployeeFilter = z.infer<typeof employeeFilterSchema>;

export type EmployeeRow = {
  id: string;
  employeeNumber: string;
  name: string;
  email: string | null;
  companyId: string;
  companyName: string;
  kitDelivered: boolean;
  deliveredAt: string | null;
  deliveredByName: string | null;
};
