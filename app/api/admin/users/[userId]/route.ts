import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, toErrorResponse } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiAdmin } from "@/lib/auth/dal";
import {
  activeChangeSchema,
  nameChangeSchema,
  roleChangeSchema,
} from "@/lib/validation/user";
import { setUserActive, setUserName, setUserRole } from "@/server/use-cases/users";

const idSchema = z.string().uuid("Identificador de utilizador inválido.");

/**
 * PATCH /api/admin/users/:userId
 *
 * Altera o perfil ou o estado de ativação. As salvaguardas — não deixar a
 * aplicação sem administradores ativos — vivem nas funções SQL, com a linha
 * bloqueada.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    await requireApiAdmin();

    const { userId } = await context.params;
    const id = idSchema.safeParse(userId);
    if (!id.success) throw new AppError("USER_NOT_FOUND");

    const body: unknown = await request.json().catch(() => null);

    const nome = nameChangeSchema.safeParse(body);
    if (nome.success) {
      await setUserName(id.data, nome.data.name);
      return ok({ id: id.data, name: nome.data.name });
    }

    const papel = roleChangeSchema.safeParse(body);
    if (papel.success) {
      await setUserRole(id.data, papel.data.role);
      return ok({ id: id.data, role: papel.data.role });
    }

    const ativo = activeChangeSchema.safeParse(body);
    if (ativo.success) {
      await setUserActive(id.data, ativo.data.isActive);
      return ok({ id: id.data, isActive: ativo.data.isActive });
    }

    throw new AppError("VALIDATION_ERROR", {
      details: ["Indique o nome, o perfil a atribuir ou o estado de ativação."],
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
