import type { NextRequest } from "next/server";
import { ok, toErrorResponse } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiAdmin, requireApiUser } from "@/lib/auth/dal";
import { companyInputSchema } from "@/lib/validation/company";
import { listCompanyTotals, saveCompany } from "@/server/use-cases/companies";

/** GET /api/companies — lista com stock. Qualquer utilizador ativo. */
export async function GET() {
  try {
    await requireApiUser();
    return ok(await listCompanyTotals());
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/companies — cria. Apenas administradores. */
export async function POST(request: NextRequest) {
  try {
    await requireApiAdmin();

    const body: unknown = await request.json().catch(() => null);
    const parsed = companyInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", {
        details: parsed.error.issues.map((issue) => issue.message),
      });
    }

    return ok(await saveCompany(parsed.data), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
