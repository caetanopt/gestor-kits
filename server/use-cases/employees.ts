import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/api/errors";
import { mapPostgrestError } from "@/lib/api/rpc";
import {
  employeeResultSchema,
  type EmployeeFilter,
  type EmployeeInput,
  type EmployeeResult,
  type EmployeeRow,
} from "@/lib/validation/employee";

export const EMPLOYEE_PAGE_SIZE = 50;

/**
 * Listagem administrativa de colaboradores.
 *
 * Lê a vista `employee_list`, que é security_invoker: como só administradores
 * conseguem ler `employees`, a listagem também é. O operador continua sem
 * conseguir enumerar colaboradores.
 */
export async function listEmployees(
  filter: EmployeeFilter,
  page = 0,
): Promise<{ rows: EmployeeRow[]; hasMore: boolean }> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("employee_list")
    .select(
      "id, employee_number, name, email, company_id, company_name, kit_delivered, delivered_at, delivered_by_name",
    )
    .order("name", { ascending: true })
    // Um a mais do que cabe na página, para saber se há mais.
    .range(page * EMPLOYEE_PAGE_SIZE, page * EMPLOYEE_PAGE_SIZE + EMPLOYEE_PAGE_SIZE);

  if (filter.companyId) query = query.eq("company_id", filter.companyId);
  if (filter.estado) query = query.eq("kit_delivered", filter.estado === "entregue");
  if (filter.semEmail) query = query.is("email", null);

  if (filter.q) {
    // Pesquisa por número, nome ou email. As vírgulas e parênteses têm
    // significado na sintaxe do PostgREST, por isso são removidas do termo.
    const termo = filter.q.replace(/[,()*]/g, " ").trim();
    if (termo) {
      query = query.or(
        `employee_number.ilike.%${termo}%,name.ilike.%${termo}%,email.ilike.%${termo}%`,
      );
    }
  }

  const { data, error } = await query;
  if (error) throw mapPostgrestError(error);

  const linhas = data ?? [];

  return {
    hasMore: linhas.length > EMPLOYEE_PAGE_SIZE,
    rows: linhas.slice(0, EMPLOYEE_PAGE_SIZE).map((row) => ({
      id: row.id,
      employeeNumber: row.employee_number,
      name: row.name,
      email: row.email,
      companyId: row.company_id,
      companyName: row.company_name,
      kitDelivered: row.kit_delivered,
      deliveredAt: row.delivered_at,
      deliveredByName: row.delivered_by_name,
    })),
  };
}

/** Cria ou edita um colaborador. Apenas administradores (verificado no SQL). */
export async function saveEmployee(
  input: EmployeeInput & { id?: string | undefined },
): Promise<EmployeeResult> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("save_employee", {
    p_id: input.id ?? null,
    p_employee_number: input.employeeNumber,
    p_name: input.name,
    p_email: input.email,
    p_company_id: input.companyId,
  });

  if (error) throw mapPostgrestError(error);

  const parsed = employeeResultSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[rpc] resposta inesperada de save_employee", parsed.error.issues);
    throw new AppError("INTERNAL_ERROR");
  }
  return parsed.data;
}
