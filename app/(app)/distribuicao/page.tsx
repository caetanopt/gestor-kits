import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { listCompanyTotals } from "@/server/use-cases/companies";
import { DistributionScreen } from "@/components/distribution/distribution-screen";

export const metadata: Metadata = { title: "Distribuição · Kits" };

export default async function DistribuicaoPage() {
  // Verificação no servidor: o layout já a faz, mas a página não deve
  // depender disso para se proteger.
  await requireUser();

  // As empresas seguem para o cliente porque o formulário de "não está na
  // lista" precisa delas. São poucas, e já legíveis por qualquer conta ativa.
  const companies = (await listCompanyTotals()).map((company) => ({
    id: company.id,
    name: company.name,
  }));

  return (
    <div className="space-y-6">
      {/* Mais pequeno no telemóvel, onde cada pixel da dobra conta, mas
          visível: o rótulo do cabeçalho também desaparece abaixo de sm, e sem
          este o ecrã ficava sem nada a dizer onde se está. */}
      <h1 className="text-ink-700 text-center text-sm font-semibold tracking-wide uppercase sm:text-lg">
        Distribuição de Kits
      </h1>
      <DistributionScreen companies={companies} />
    </div>
  );
}
