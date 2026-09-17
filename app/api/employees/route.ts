import type { NextRequest } from "next/server";
import { ok, toErrorResponse } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiSession } from "@/lib/auth/dal";
import { novoColaboradorSchema } from "@/lib/validation/employee";
import { createEmployeeForDelivery } from "@/server/use-cases/deliveries";

/**
 * POST /api/employees — acrescenta um colaborador ao balcão.
 *
 * Aberta a qualquer conta ativa, e não só a administradores: quem encontra
 * as pessoas em falta é quem está a distribuir. A autorização a sério vive em
 * `public.create_employee_for_delivery`, que verifica a conta dentro da mesma
 * transação que escreve — por isso aqui basta confirmar que há sessão.
 *
 * A função só cria. A edição continua a ser matéria da área administrativa.
 */
export async function POST(request: NextRequest) {
  try {
    await requireApiSession();

    const body: unknown = await request.json().catch(() => null);
    const parsed = novoColaboradorSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", {
        details: parsed.error.issues.map((issue) => issue.message),
      });
    }

    return ok(await createEmployeeForDelivery(parsed.data), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
