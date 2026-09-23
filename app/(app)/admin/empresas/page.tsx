import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { listCompanyTotals } from "@/server/use-cases/companies";
import { CompanyManager } from "@/components/admin/company-manager";

export const metadata: Metadata = { title: "Empresas · Kits" };

export default async function EmpresasPage() {
  await requireAdmin();
  const companies = await listCompanyTotals();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-ink-900 font-display text-3xl font-normal">Empresas</h1>
        <p className="text-ink-700 mt-1 text-sm">
          Cada empresa tem um limite de kits independente. O código é gerado a partir do
          nome e serve para identificar a empresa nos ficheiros de importação.
        </p>
      </div>
      <CompanyManager companies={companies} />
    </div>
  );
}
