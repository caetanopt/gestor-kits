import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Distribuição · Kits" };

export default async function DistribuicaoPage() {
  const user = await requireUser();

  return (
    <div className="space-y-4">
      <h1 className="text-ink-900 text-xl font-semibold">Distribuição</h1>
      <p className="text-ink-500 text-sm">
        Sessão iniciada como {user.name}. O ecrã de pesquisa e entrega é implementado na
        etapa seguinte.
      </p>
    </div>
  );
}
