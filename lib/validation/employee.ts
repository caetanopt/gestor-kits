import { z } from "zod";
import { employeeNumberOpcionalSchema, employeeNumberSchema } from "./delivery";

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
 * Criação na página Colaboradores: igual à edição, mas o número pode ficar
 * vazio — a base de dados atribui um automático (migração 0020). Na edição
 * (`employeeInputSchema`) continua obrigatório.
 */
export const employeeCreateSchema = employeeInputSchema.extend({
  employeeNumber: employeeNumberOpcionalSchema,
});

export type EmployeeCreate = z.infer<typeof employeeCreateSchema>;

/**
 * Colaborador acrescentado ao balcão, no ecrã de distribuição.
 *
 * A empresa é obrigatória — é por ela que a entrega é contabilizada. O email
 * não: ninguém o pede a quem está à espera do kit, mas quem pesquisou por
 * email já o tem escrito e não se perde.
 */
export const novoColaboradorSchema = z.object({
  // Opcional desde a migração 0020: sem número, é atribuído um automático.
  employeeNumber: employeeNumberOpcionalSchema,
  name: employeeNameSchema,
  // Opcional, como em todo o resto da aplicação desde a migração 0012. Existe
  // porque quem chegou aqui a pesquisar por email já o tem escrito, e deitá-lo
  // fora fazia com que a pesquisa seguinte pelo mesmo email não encontrasse a
  // pessoa que se acabou de acrescentar.
  email: employeeEmailSchema.nullish().transform((valor) => valor ?? null),
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
