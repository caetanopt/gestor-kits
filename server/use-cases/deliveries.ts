import "server-only";
import type { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/api/errors";
import { mapPostgrestError } from "@/lib/api/rpc";
import {
  deliveryResultSchema,
  employeeLookupSchema,
  employeeSearchSchema,
  reverseResultSchema,
  type DeliveryResult,
  type EmployeeLookup,
  type EmployeeSearch,
  type ReverseResult,
} from "@/lib/validation/delivery";

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
 * Entregas na última hora.
 *
 * O total entregue diz onde se chegou; este diz se ainda está a acontecer e a
 * que ritmo, que é a única coisa sobre a qual dá para agir durante o evento
 * — abrir outro balcão, chamar mais gente.
 *
 * `head: true` pede só a contagem, sem trazer as linhas. Anuladas não contam:
 * o que interessa é o que saiu e ficou entregue.
 */
export async function countDeliveriesLastHour(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("deliveries")
    .select("id", { count: "exact", head: true })
    .is("reversed_at", null)
    .gte("delivered_at", desde);

  if (error) throw mapPostgrestError(error);
  return count ?? 0;
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
