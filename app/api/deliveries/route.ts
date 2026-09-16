import type { NextRequest } from "next/server";
import { ok, toErrorResponse } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiSession } from "@/lib/auth/dal";
import { deliveryRequestSchema } from "@/lib/validation/delivery";
import { deliverKit } from "@/server/use-cases/deliveries";

/**
 * POST /api/deliveries
 *
 * Handler fino: valida a sessão, valida o corpo, chama o caso de uso e
 * converte o resultado em HTTP. As regras de negócio estão todas em
 * `public.deliver_kit`, dentro de uma transação.
 */
export async function POST(request: NextRequest) {
  try {
    await requireApiSession();

    const body: unknown = await request.json().catch(() => null);
    const parsed = deliveryRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", {
        details: parsed.error.issues.map((issue) => issue.message),
      });
    }

    return ok(await deliverKit(parsed.data));
  } catch (error) {
    return toErrorResponse(error);
  }
}
