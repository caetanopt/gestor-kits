import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { listCompanyStock } from "@/server/use-cases/companies";
import { CompanyManager } from "@/components/admin/company-manager";

export const metadata: Metadata = { title: "Empresas · Kits" };

export default async function EmpresasPage() {
  await requireAdmin();
  const companies = await listCompanyStock();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-ink-900 text-xl font-semibold">Empresas</h1>
        <p className="text-ink-700 mt-1 text-sm">
          Cada empresa tem um limite de kits independente.
        </p>
      </div>
      <CompanyManager companies={companies} />
    </div>
  );
}
