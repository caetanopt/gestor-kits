import type { NextRequest } from "next/server";
import { ok, toErrorResponse } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiSession } from "@/lib/auth/dal";
import { employeeNumberSchema } from "@/lib/validation/delivery";
import { findEmployeeForDelivery } from "@/server/use-cases/deliveries";

/**
 * GET /api/employees/:employeeNumber
 *
 * Pesquisa exata. Não existe pesquisa por prefixo nem por nome: o operador
 * não deve conseguir enumerar a base de colaboradores.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ employeeNumber: string }> },
) {
  try {
    await requireApiSession();

    const { employeeNumber } = await context.params;
    const parsed = employeeNumberSchema.safeParse(decodeURIComponent(employeeNumber));
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", {
        details: parsed.error.issues.map((issue) => issue.message),
      });
    }

    return ok(await findEmployeeForDelivery(parsed.data));
  } catch (error) {
    return toErrorResponse(error);
  }
}
