import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { listCompanyStock } from "@/server/use-cases/companies";
import { ImportWizard } from "@/components/admin/import-wizard";

export const metadata: Metadata = { title: "Importar · Kits" };

export default async function ImportarPage() {
  await requireAdmin();
  const companies = await listCompanyStock();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-ink-900 text-xl font-semibold">Importar colaboradores</h1>
        <p className="text-ink-500 mt-1 text-sm">
          O ficheiro é analisado primeiro; nada é escrito até confirmar.
        </p>
      </div>
      <ImportWizard hasCompanies={companies.length > 0} />
    </div>
  );
}
