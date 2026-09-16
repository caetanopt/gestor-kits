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
