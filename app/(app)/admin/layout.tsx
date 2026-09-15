import { requireAdmin } from "@/lib/auth/dal";

/** Área administrativa: exige perfil admin, verificado no servidor. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
