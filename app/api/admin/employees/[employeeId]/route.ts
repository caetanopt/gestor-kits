import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, toErrorResponse } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiAdmin } from "@/lib/auth/dal";
import { employeeInputSchema } from "@/lib/validation/employee";
import { saveEmployee } from "@/server/use-cases/employees";

const idSchema = z.string().uuid("Identificador de colaborador inválido.");

/** PUT /api/admin/employees/:employeeId — edita um colaborador. */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ employeeId: string }> },
) {
  try {
    await requireApiAdmin();

    const { employeeId } = await context.params;
    const id = idSchema.safeParse(employeeId);
    if (!id.success) throw new AppError("EMPLOYEE_NOT_FOUND");

    const body: unknown = await request.json().catch(() => null);
    const parsed = employeeInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", {
        details: parsed.error.issues.map((issue) => issue.message),
      });
    }

    return ok(await saveEmployee({ ...parsed.data, id: id.data }));
  } catch (error) {
    return toErrorResponse(error);
  }
}
