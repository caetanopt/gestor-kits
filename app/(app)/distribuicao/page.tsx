import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { DistributionScreen } from "@/components/distribution/distribution-screen";

export const metadata: Metadata = { title: "Distribuição · Kits" };

export default async function DistribuicaoPage() {
  // Verificação no servidor: o layout já a faz, mas a página não deve
  // depender disso para se proteger.
  await requireUser();

  return (
    <div className="space-y-6">
      <h1 className="text-ink-700 text-center text-lg font-semibold tracking-wide uppercase">
        Distribuição de Kits
      </h1>
      <DistributionScreen />
    </div>
  );
}
