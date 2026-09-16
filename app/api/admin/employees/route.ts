import type { NextRequest } from "next/server";
import { ok, toErrorResponse } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiAdmin } from "@/lib/auth/dal";
import { employeeInputSchema } from "@/lib/validation/employee";
import { saveEmployee } from "@/server/use-cases/employees";

/**
 * POST /api/admin/employees — cria um colaborador.
 *
 * Separado de /api/employees/[employeeNumber], que serve a pesquisa do ecrã
 * de distribuição: são fronteiras de permissão diferentes.
 */
export async function POST(request: NextRequest) {
  try {
    await requireApiAdmin();

    const body: unknown = await request.json().catch(() => null);
    const parsed = employeeInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", {
        details: parsed.error.issues.map((issue) => issue.message),
      });
    }

    return ok(await saveEmployee(parsed.data), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
