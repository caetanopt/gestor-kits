import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, toErrorResponse } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiSession } from "@/lib/auth/dal";
import { reverseRequestSchema } from "@/lib/validation/delivery";
import { reverseDelivery } from "@/server/use-cases/deliveries";

const idSchema = z.string().uuid("Identificador de entrega inválido.");

/**
 * POST /api/deliveries/:deliveryId/reverse
 *
 * Qualquer conta ativa, desde a migração 0019: quem dá pelo engano é quem
 * está ao balcão. Aqui confirma-se apenas que há sessão; quem decide é
 * `public.reverse_delivery`, que verifica a conta dentro da mesma transação
 * que escreve — a verificação mais forte das duas.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ deliveryId: string }> },
) {
  try {
    await requireApiSession();

    const { deliveryId } = await context.params;
    const id = idSchema.safeParse(deliveryId);
    if (!id.success) throw new AppError("DELIVERY_NOT_FOUND");

    const body: unknown = await request.json().catch(() => ({}));
    const parsed = reverseRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new AppError("VALIDATION_ERROR");

    return ok(await reverseDelivery({ deliveryId: id.data, reason: parsed.data.reason }));
  } catch (error) {
    return toErrorResponse(error);
  }
}
