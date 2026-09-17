import { z } from "zod";
import { employeeNumberSchema } from "./delivery";

export const employeeNameSchema = z
  .string()
  .trim()
  .min(1, "Indique o nome do colaborador.")
  .max(160, "O nome é demasiado longo (máximo 160 caracteres).");

/**
 * Email do colaborador. Opcional.
 *
 * Nem todas as empresas entregam listas com email, e exigi-lo obrigava a
 * inventar valores ou a deixar pessoas de fora. O que continua a não ser
 * aceite é um email mal escrito: um campo vazio é uma escolha, um
 * "joao@empresa" é um erro por corrigir.
 *
 * O campo vazio chega aqui como string vazia (vem de um <input>), e sai como
 * `null` — a coluna não distingue "não preenchido" de "vazio", e ter as duas
 * formas na base de dados só daria falsos negativos no filtro "sem email".
 */
export const employeeEmailSchema = z
  .string()
  .trim()
  .max(254, "O email é demasiado longo.")
  .refine(
    (valor) => valor === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor),
    "Email inválido.",
  )
  .transform((valor) => (valor === "" ? null : valor.toLowerCase()));

export const employeeInputSchema = z.object({
  employeeNumber: employeeNumberSchema,
  name: employeeNameSchema,
  // `nullish` porque o campo pode vir ausente (importação sem coluna),
  // a null (API) ou vazio (formulário). As três formas são a mesma coisa.
  email: employeeEmailSchema.nullish().transform((valor) => valor ?? null),
  companyId: z.string().uuid("Selecione uma empresa."),
});

/**
 * Colaborador acrescentado ao balcão, no ecrã de distribuição.
 *
 * Sem email: ninguém o pede a quem está à espera do kit, e a coluna é
 * opcional desde a migração 0012. A empresa é obrigatória — é por ela que a
 * entrega é contabilizada.
 */
export const novoColaboradorSchema = z.object({
  employeeNumber: employeeNumberSchema,
  name: employeeNameSchema,
  companyId: z.string().uuid("Selecione uma empresa."),
});

export type NovoColaborador = z.infer<typeof novoColaboradorSchema>;

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
  // O email é opcional, mas quem quiser completar a lista precisa de uma
  // forma de encontrar quem ainda não o tem.
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
