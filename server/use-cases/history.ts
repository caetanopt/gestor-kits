import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapPostgrestError } from "@/lib/api/rpc";
import type { HistoryFilter } from "@/lib/validation/history";
import type { AuditAction } from "@/lib/supabase/database.types";

export type HistoryEntry = {
  id: number;
  action: AuditAction;
  performedAt: string;
  performedByName: string;
  employeeNumber: string | null;
  employeeName: string | null;
  companyName: string | null;
  notes: string | null;
  deliveryId: string | null;
  isActiveDelivery: boolean;
};

/**
 * Registos por página.
 *
 * Eram 100, o que dava uma página longa de mais para ser lida: o histórico
 * consulta-se para encontrar uma ação concreta, e para isso servem os
 * filtros, não o deslocamento. 25 cabe num ecrã sem esconder a paginação.
 */
export const HISTORY_PAGE_SIZE = 25;

/**
 * Histórico com filtros.
 *
 * Lê a vista `delivery_history`, que já traz as junções resolvidas. A vista é
 * security_invoker, portanto o RLS continua a aplicar-se: só administradores
 * conseguem ler `delivery_logs` e, por consequência, o histórico.
 */
export type HistoryPage = {
  entries: HistoryEntry[];
  /** Registos que correspondem aos filtros, não só os desta página. */
  total: number;
};

export async function listHistory(filter: HistoryFilter, page = 0): Promise<HistoryPage> {
  const supabase = await createSupabaseServerClient();

  // `count: "exact"` traz o total dos filtros no mesmo pedido, sem uma
  // segunda ida à base de dados. É ele que permite dizer "página 3 de 12" em
  // vez de um "seguintes" que não diz onde se está nem quanto falta.
  let query = supabase
    .from("delivery_history")
    .select(
      "id, action, performed_at, performed_by_name, employee_number, employee_name, company_name, notes, delivery_id, is_active_delivery",
      { count: "exact" },
    )
    .order("performed_at", { ascending: false })
    .order("id", { ascending: false })
    .range(page * HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE + HISTORY_PAGE_SIZE - 1);

  if (filter.companyId) query = query.eq("company_id", filter.companyId);
  if (filter.action) query = query.eq("action", filter.action);
  if (filter.employeeNumber) {
    query = query.eq("employee_number", filter.employeeNumber.trim());
  }
  if (filter.from) query = query.gte("performed_at", `${filter.from}T00:00:00Z`);
  if (filter.to) query = query.lte("performed_at", `${filter.to}T23:59:59.999Z`);

  const { data, error, count } = await query;
  if (error) throw mapPostgrestError(error);

  const total = count ?? 0;

  return {
    total,
    entries: (data ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      performedAt: row.performed_at,
      performedByName: row.performed_by_name,
      employeeNumber: row.employee_number,
      employeeName: row.employee_name,
      companyName: row.company_name,
      notes: row.notes,
      deliveryId: row.delivery_id,
      isActiveDelivery: row.is_active_delivery ?? false,
    })),
  };
}
