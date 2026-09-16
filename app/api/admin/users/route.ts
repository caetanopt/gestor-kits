import type { NextRequest } from "next/server";
import { ok, toErrorResponse } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiAdmin } from "@/lib/auth/dal";
import { newUserSchema } from "@/lib/validation/user";
import { createUser } from "@/server/use-cases/users";

/** POST /api/admin/users — cria uma conta. Apenas administradores. */
export async function POST(request: NextRequest) {
  try {
    await requireApiAdmin();

    const body: unknown = await request.json().catch(() => null);
    const parsed = newUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", {
        details: parsed.error.issues.map((issue) => issue.message),
      });
    }

    return ok(await createUser(parsed.data), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
