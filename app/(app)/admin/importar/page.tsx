import type { Metadata } from "next";
import { ProgressLink } from "@/components/ui/route-progress";
import { requireAdmin } from "@/lib/auth/dal";
import { listCompanyTotals } from "@/server/use-cases/companies";
import { ImportWizard } from "@/components/admin/import-wizard";

export const metadata: Metadata = { title: "Importar · Kits" };

export default async function ImportarPage() {
  await requireAdmin();
  const companies = await listCompanyTotals();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-ink-900 font-display text-3xl font-normal">
          Importar colaboradores
        </h1>
        <p className="text-ink-700 mt-1 text-sm">
          O ficheiro é analisado primeiro; nada é escrito até confirmar.
        </p>
        <ProgressLink
          href="/admin/colaboradores"
          className="text-ink-900 mt-2 inline-block text-sm font-medium underline"
        >
          ← Voltar aos colaboradores
        </ProgressLink>
      </div>
      <ImportWizard hasCompanies={companies.length > 0} />
    </div>
  );
}
