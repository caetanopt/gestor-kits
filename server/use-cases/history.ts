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

export const HISTORY_PAGE_SIZE = 100;

/**
 * Histórico com filtros.
 *
 * Lê a vista `delivery_history`, que já traz as junções resolvidas. A vista é
 * security_invoker, portanto o RLS continua a aplicar-se: só administradores
 * conseguem ler `delivery_logs` e, por consequência, o histórico.
 */
export async function listHistory(
  filter: HistoryFilter,
  page = 0,
): Promise<{ entries: HistoryEntry[]; hasMore: boolean }> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("delivery_history")
    .select(
      "id, action, performed_at, performed_by_name, employee_number, employee_name, company_name, notes, delivery_id, is_active_delivery",
    )
    .order("performed_at", { ascending: false })
    .order("id", { ascending: false })
    // Pede-se um a mais do que cabe na página para saber se há mais.
    .range(page * HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE + HISTORY_PAGE_SIZE);

  if (filter.companyId) query = query.eq("company_id", filter.companyId);
  if (filter.action) query = query.eq("action", filter.action);
  if (filter.employeeNumber) {
    query = query.eq("employee_number", filter.employeeNumber.trim());
  }
  if (filter.from) query = query.gte("performed_at", `${filter.from}T00:00:00Z`);
  if (filter.to) query = query.lte("performed_at", `${filter.to}T23:59:59.999Z`);

  const { data, error } = await query;
  if (error) throw mapPostgrestError(error);

  const rows = data ?? [];
  const hasMore = rows.length > HISTORY_PAGE_SIZE;

  return {
    hasMore,
    entries: rows.slice(0, HISTORY_PAGE_SIZE).map((row) => ({
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
