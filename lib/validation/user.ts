import { z } from "zod";
import type { UserRole } from "@/lib/supabase/database.types";

export const roleSchema = z.enum(["admin", "distributor"], {
  message: "Perfil inválido.",
});

export const newUserSchema = z.object({
  email: z
    .string({ message: "Indique o email." })
    .trim()
    .min(1, "Indique o email.")
    .max(254, "O email é demasiado longo.")
    .email("Email inválido.")
    .transform((valor) => valor.toLowerCase()),
  fullName: z.string().trim().max(160, "O nome é demasiado longo.").optional(),
  // 8 caracteres é o mínimo do Supabase Auth. Exigido aqui para o erro
  // aparecer no formulário e não como falha vinda do servidor de autenticação.
  password: z
    .string({ message: "Indique uma palavra-passe." })
    .min(8, "A palavra-passe tem de ter pelo menos 8 caracteres.")
    .max(72, "A palavra-passe é demasiado longa."),
  role: roleSchema,
});

export const roleChangeSchema = z.object({ role: roleSchema });
export const activeChangeSchema = z.object({ isActive: z.boolean() });

export type NewUserInput = z.infer<typeof newUserSchema>;

export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
};
