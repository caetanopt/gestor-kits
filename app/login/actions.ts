"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { homePathFor } from "@/lib/auth/dal";

const credentialsSchema = z.object({
  email: z.string().trim().min(1, "Indique o email.").email("Email inválido."),
  password: z.string().min(1, "Indique a palavra-passe."),
});

export type LoginState = { error: string | null };

export async function signIn(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  // Mensagem única para credenciais erradas e conta inexistente: dizer qual
  // dos dois falhou permitiria descobrir que emails estão registados.
  if (error || !data.user) {
    return { error: "Email ou palavra-passe incorretos." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return { error: "A sua conta está desativada. Contacte um administrador." };
  }

  // Fora do try/catch: redirect() funciona lançando uma exceção.
  redirect(homePathFor(profile.role));
}

export async function signOut(): Promise<never> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
