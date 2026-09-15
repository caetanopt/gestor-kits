import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/api/errors";
import type { UserRole } from "@/lib/supabase/database.types";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

/**
 * Utilizador da sessão atual, ou null.
 *
 * Usa `auth.getUser()` e não `auth.getSession()`: o primeiro valida o token
 * junto do servidor de autenticação, o segundo confia no cookie. Num
 * componente de servidor, confiar no cookie não é suficiente.
 *
 * `cache()` garante uma única ida à base de dados por pedido, mesmo que
 * vários componentes precisem do utilizador.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;

  return {
    id: profile.id,
    email: profile.email,
    name: profile.full_name.trim() || profile.email,
    role: profile.role,
  };
});

/** Exige sessão numa página. Redireciona para o login se não houver. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Exige perfil de administrador numa página. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/distribuicao");
  return user;
}

/**
 * Equivalentes para Route Handlers: lançam AppError em vez de redirecionar,
 * para que a resposta seja JSON com o código de erro correto.
 */
export async function requireApiUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED");
  return user;
}

export async function requireApiAdmin(): Promise<CurrentUser> {
  const user = await requireApiUser();
  if (user.role !== "admin") throw new AppError("FORBIDDEN");
  return user;
}

/** Página inicial de cada perfil. */
export function homePathFor(role: UserRole): "/admin" | "/distribuicao" {
  return role === "admin" ? "/admin" : "/distribuicao";
}
