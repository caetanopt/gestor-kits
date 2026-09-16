import type { NextRequest } from "next/server";
import { ok, toErrorResponse } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiSession } from "@/lib/auth/dal";
import { searchTermSchema } from "@/lib/validation/delivery";
import { searchEmployeesForDelivery } from "@/server/use-cases/deliveries";

/**
 * GET /api/employees/search?q=…
 *
 * Pesquisa do ecrã de distribuição por nome ou email. O email exige
 * correspondência exata e o nome só sugere depois do primeiro espaço — as
 * regras vivem na função SQL, que é quem as tem de garantir.
 *
 * A pesquisa por número continua em /api/employees/[employeeNumber], também
 * com correspondência exata.
 */
export async function GET(request: NextRequest) {
  try {
    await requireApiSession();

    const parsed = searchTermSchema.safeParse(
      request.nextUrl.searchParams.get("q") ?? "",
    );
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", {
        details: parsed.error.issues.map((issue) => issue.message),
      });
    }

    return ok(await searchEmployeesForDelivery(parsed.data));
  } catch (error) {
    return toErrorResponse(error);
  }
}
