import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/api/errors";
import { mapPostgrestError } from "@/lib/api/rpc";
import type { NewUserInput, UserRow } from "@/lib/validation/user";
import type { UserRole } from "@/lib/supabase/database.types";

/** Lista as contas. Só administradores conseguem ler `profiles` por RLS. */
export async function listUsers(): Promise<UserRow[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active, created_at")
    .order("role", { ascending: true })
    .order("email", { ascending: true });

  if (error) throw mapPostgrestError(error);

  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    name: row.full_name.trim(),
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
  }));
}

/**
 * Altera o perfil de uma conta.
 *
 * A salvaguarda do último administrador vive no SQL, com a linha bloqueada:
 * verificá-la aqui seria a mesma condição de corrida da entrega de kits — dois
 * administradores a despromoverem-se ao mesmo tempo deixariam a aplicação sem
 * nenhum.
 */
export async function setUserRole(userId: string, role: UserRole): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_user_role", {
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw mapPostgrestError(error);
}

export async function setUserActive(userId: string, isActive: boolean): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_user_active", {
    p_user_id: userId,
    p_active: isActive,
  });
  if (error) throw mapPostgrestError(error);
}

/**
 * Cria uma conta.
 *
 * Único ponto da aplicação que usa a service role, porque só a API de
 * administração do Supabase Auth cria utilizadores. A conta é criada já
 * confirmada: quem a cria é um administrador que a vai entregar em mão, e o
 * circuito de confirmação por email só atrasaria a preparação do evento.
 *
 * O perfil é criado pelo trigger `on_auth_user_created` com o papel de
 * distribuidor; se tiver sido pedido administrador, é promovido a seguir com
 * a sessão de quem fez o pedido, para a alteração ficar auditada em nome
 * dessa pessoa.
 */
export async function createUser(input: NewUserInput): Promise<UserRow> {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new AppError("USER_CREATION_UNAVAILABLE");

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: input.fullName ? { full_name: input.fullName } : {},
  });

  if (error || !data.user) {
    const mensagem = error?.message?.toLowerCase() ?? "";
    if (mensagem.includes("already") || mensagem.includes("registered")) {
      throw new AppError("DUPLICATE_USER_EMAIL");
    }
    console.error("[users] falha a criar conta", {
      code: error?.code,
      status: error?.status,
    });
    throw new AppError("INTERNAL_ERROR");
  }

  if (input.role === "admin") {
    await setUserRole(data.user.id, "admin");
  }

  return {
    id: data.user.id,
    email: input.email,
    name: input.fullName ?? "",
    role: input.role,
    isActive: true,
    createdAt: data.user.created_at,
  };
}
