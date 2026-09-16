import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, homePathFor } from "@/lib/auth/dal";
import { CaetanoLogo } from "@/components/brand/caetano-logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar · Distribuição de Kits" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user.role));

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <CaetanoLogo className="text-azul-900 h-8 w-auto" />
          <h1 className="text-ink-900 mt-6 text-xl font-semibold">
            Distribuição de Kits
          </h1>
          <p className="text-ink-700 mt-1 text-sm">Inicie sessão para continuar.</p>
        </div>
        <div className="ring-ink-200 rounded-2xl bg-white p-6 shadow-sm ring-1">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
