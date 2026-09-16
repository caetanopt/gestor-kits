import { z } from "zod";
import { employeeNumberSchema } from "./delivery";

export const employeeNameSchema = z
  .string()
  .trim()
  .min(1, "Indique o nome do colaborador.")
  .max(160, "O nome é demasiado longo (máximo 160 caracteres).");

/**
 * Email do colaborador. Obrigatório.
 *
 * Também imposto em `public.save_employee` e `public.import_employees`: a
 * validação aqui dá mensagens úteis, mas a garantia está na base de dados,
 * que é o único caminho de escrita.
 */
export const employeeEmailSchema = z
  .string({ message: "Indique o email do colaborador." })
  .trim()
  .min(1, "Indique o email do colaborador.")
  .max(254, "O email é demasiado longo.")
  .email("Email inválido.")
  .transform((valor) => valor.toLowerCase());

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
  // Colaboradores criados antes de o email passar a obrigatório. Sem forma de
  // os encontrar, ficariam incompletos para sempre.
  semEmail: z.boolean().optional(),
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
