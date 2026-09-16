import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, toErrorResponse } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiAdmin } from "@/lib/auth/dal";
import { companyInputSchema } from "@/lib/validation/company";
import { saveCompany } from "@/server/use-cases/companies";

const idSchema = z.string().uuid("Identificador de empresa inválido.");

/** PUT /api/companies/:companyId — edita. Apenas administradores. */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ companyId: string }> },
) {
  try {
    await requireApiAdmin();

    const { companyId } = await context.params;
    const id = idSchema.safeParse(companyId);
    if (!id.success) throw new AppError("COMPANY_NOT_FOUND");

    const body: unknown = await request.json().catch(() => null);
    const parsed = companyInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", {
        details: parsed.error.issues.map((issue) => issue.message),
      });
    }

    return ok(await saveCompany({ ...parsed.data, id: id.data }));
  } catch (error) {
    return toErrorResponse(error);
  }
}
