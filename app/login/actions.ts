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

  if (error || !data.user) {
    // O utilizador recebe sempre a mesma mensagem, quer as credenciais
    // estejam erradas, quer a conta não exista ou não esteja confirmada:
    // distinguir os casos permitiria descobrir que emails estão registados.
    //
    // Mas o motivo real fica nos logs do servidor. Sem isto, um operador
    // bloqueado a meio de um evento não tem como ser diagnosticado — só o
    // email é registado, nunca a palavra-passe.
    console.warn("[login] autenticação recusada", {
      email: parsed.data.email,
      code: error?.code ?? "sem_utilizador",
      status: error?.status,
      reason: error?.message,
    });

    // Modo de diagnóstico: com LOGIN_DIAGNOSTICS=1 o motivo real aparece no
    // ecrã. Serve para resolver um login que falha sem se perceber porquê,
    // sem obrigar a procurar nos logs do servidor.
    //
    // Desligado por omissão porque revela se uma conta existe. Voltar a
    // desligar assim que o problema estiver resolvido.
    if (process.env.LOGIN_DIAGNOSTICS === "1") {
      return {
        error: `[diagnóstico] ${error?.code ?? "sem utilizador"} · ${
          error?.status ?? "?"
        } · ${error?.message ?? "sem detalhe"}`,
      };
    }

    return { error: "Email ou palavra-passe incorretos." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    // Distinguido nos logs porque são problemas diferentes: sem perfil
    // significa que o trigger de criação não correu; inativo é uma decisão
    // administrativa.
    console.warn("[login] sessão recusada depois de autenticar", {
      email: parsed.data.email,
      motivo: profile ? "conta_inativa" : "perfil_inexistente",
    });

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
