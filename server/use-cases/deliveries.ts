import "server-only";
import type { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/api/errors";
import { mapPostgrestError } from "@/lib/api/rpc";
import { lerTodasAsPaginas } from "@/lib/supabase/paginar";
import {
  deliveryResultSchema,
  employeeLookupSchema,
  employeeSearchSchema,
  reverseResultSchema,
  type ExportedEmployee,
  type DeliveryResult,
  type EmployeeLookup,
  type EmployeeSearch,
  type ReverseResult,
} from "@/lib/validation/delivery";
import type { NovoColaborador } from "@/lib/validation/employee";

/**
 * Valida a resposta de uma função PostgreSQL.
 *
 * As funções devolvem jsonb; se o SQL e a aplicação divergirem, queremos
 * falhar aqui com um erro claro nos logs, e não passar dados malformados à
 * interface.
 */
function parseRpc<T>(schema: z.ZodType<T>, value: unknown, fn: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    console.error(`[rpc] resposta inesperada de ${fn}`, parsed.error.issues);
    throw new AppError("INTERNAL_ERROR");
  }
  return parsed.data;
}

/** Pesquisa exata pelo número de colaborador. */
export async function findEmployeeForDelivery(
  employeeNumber: string,
): Promise<EmployeeLookup> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("find_employee_for_delivery", {
    p_employee_number: employeeNumber,
  });

  if (error) throw mapPostgrestError(error);
  return parseRpc(employeeLookupSchema, data, "find_employee_for_delivery");
}

/**
 * Cria um colaborador a partir do ecrã de distribuição.
 *
 * Devolve o mesmo payload de `findEmployeeForDelivery`: o ecrã segue direto
 * para o cartão de entrega, sem uma segunda ida ao servidor.
 */
export async function createEmployeeForDelivery(
  input: NovoColaborador,
): Promise<EmployeeLookup> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("create_employee_for_delivery", {
    p_employee_number: input.employeeNumber,
    p_name: input.name,
    p_email: input.email,
    p_company_id: input.companyId,
  });

  if (error) {
    const erro = mapPostgrestError(error);
    // Número vazio recusado: base de dados anterior à migração 0020 (ver
    // semNumeroNaBaseAntiga em employees.ts, que faz o mesmo).
    if (input.employeeNumber === null && erro.code === "VALIDATION_ERROR") {
      throw new AppError("DB_OUT_OF_DATE", {
        details: [
          "A base de dados ainda exige o número de colaborador. Falta aplicar a migração 0020.",
        ],
      });
    }
    throw erro;
  }
  return parseRpc(employeeLookupSchema, data, "create_employee_for_delivery");
}

/**
 * Pesquisa por nome ou email.
 *
 * Ao contrário da pesquisa por número, esta é parcial. Os limites — mínimo de
 * caracteres, número de resultados e o email só quando foi ele que
 * correspondeu — estão na função SQL, que é quem os tem de garantir.
 */
export async function searchEmployeesForDelivery(query: string): Promise<EmployeeSearch> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("search_employees_for_delivery", {
    p_query: query,
  });

  if (error) throw mapPostgrestError(error);
  return parseRpc(employeeSearchSchema, data, "search_employees_for_delivery");
}

/**
 * Todos os colaboradores, para exportar.
 *
 * Lê `employee_list`, cujo `kit_delivered` já exclui as entregas anuladas —
 * quem teve a entrega anulada sai no documento como quem ainda não recebeu,
 * que é o que passou a ser verdade.
 *
 * Vai tudo, recebido ou não: o documento serve para ver os dois lados, e um
 * total só significa alguma coisa se as duas partes estiverem lá.
 *
 * Lida por páginas (`lerTodasAsPaginas`): o Supabase corta cada resposta em
 * 1000 linhas, e um único pedido exportava só os primeiros mil. As páginas
 * vêm por `id`; a ordem do documento — empresa, depois nome — é aplicada no
 * fim, sobre a lista inteira.
 */
export async function listEmployeesForExport(
  companyId?: string,
): Promise<ExportedEmployee[]> {
  const supabase = await createSupabaseServerClient();

  const data = await lerTodasAsPaginas(
    (depoisDe: string | null, tamanho) => {
      let query = supabase
        .from("employee_list")
        .select(
          "id, company_name, employee_number, name, email, kit_delivered, delivered_at, delivered_by_name",
        )
        .order("id", { ascending: true })
        .limit(tamanho);
      if (companyId) query = query.eq("company_id", companyId);
      if (depoisDe) query = query.gt("id", depoisDe);
      return query;
    },
    (row) => row.id,
  );

  const porNome = (a: string, b: string) => a.localeCompare(b, "pt-PT");
  data.sort((a, b) => porNome(a.company_name, b.company_name) || porNome(a.name, b.name));

  return data.map((row) => ({
    companyName: row.company_name,
    employeeNumber: row.employee_number,
    name: row.name,
    email: row.email,
    kitDelivered: row.kit_delivered,
    deliveredAt: row.delivered_at,
    deliveredByName: row.delivered_by_name,
  }));
}

/**
 * Entrega um kit.
 *
 * Toda a lógica crítica — duplicados, stock, auditoria — acontece dentro de
 * uma única transação em `public.deliver_kit`. Esta função só transporta.
 */
export async function deliverKit(input: {
  employeeNumber: string;
  idempotencyKey: string;
}): Promise<DeliveryResult> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("deliver_kit", {
    p_employee_number: input.employeeNumber,
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) throw mapPostgrestError(error);
  return parseRpc(deliveryResultSchema, data, "deliver_kit");
}

/** Anula uma entrega. Apenas administradores (verificado no SQL). */
export async function reverseDelivery(input: {
  deliveryId: string;
  reason?: string | undefined;
}): Promise<ReverseResult> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("reverse_delivery", {
    p_delivery_id: input.deliveryId,
    p_reason: input.reason ?? null,
  });

  if (error) throw mapPostgrestError(error);
  return parseRpc(reverseResultSchema, data, "reverse_delivery");
}
