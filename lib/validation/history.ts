import { z } from "zod";
import type { AuditAction } from "@/lib/supabase/database.types";

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  DELIVERED: "Kit entregue",
  DELIVERY_REVERSED: "Entrega anulada",
  EMPLOYEE_CREATED: "Colaborador criado",
  EMPLOYEE_UPDATED: "Colaborador alterado",
  EMPLOYEES_IMPORTED: "Colaboradores importados",
  COMPANY_CREATED: "Empresa criada",
  COMPANY_UPDATED: "Empresa alterada",
  COMPANY_LIMIT_UPDATED: "Limite de kits alterado",
  USER_CREATED: "Conta criada",
  USER_RENAMED: "Nome da conta alterado",
  USER_ROLE_CHANGED: "Perfil de conta alterado",
  USER_ACTIVATED: "Conta ativada",
  USER_DEACTIVATED: "Conta desativada",
};

export const historyFilterSchema = z.object({
  companyId: z.string().uuid().optional(),
  action: z
    .enum([
      "DELIVERED",
      "DELIVERY_REVERSED",
      "EMPLOYEE_CREATED",
      "EMPLOYEE_UPDATED",
      "EMPLOYEES_IMPORTED",
      "COMPANY_CREATED",
      "COMPANY_UPDATED",
      "COMPANY_LIMIT_UPDATED",
      "USER_CREATED",
      "USER_RENAMED",
      "USER_ROLE_CHANGED",
      "USER_ACTIVATED",
      "USER_DEACTIVATED",
    ])
    .optional(),
  employeeNumber: z.string().trim().max(40).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

export type HistoryFilter = z.infer<typeof historyFilterSchema>;
