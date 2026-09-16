import { requireUser } from "@/lib/auth/dal";
import { AppShell, ADMIN_NAV, DISTRIBUTOR_NAV } from "@/components/ui/app-shell";

/**
 * Shell autenticado. Toda a subárvore exige sessão válida, verificada no
 * servidor a cada pedido.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const nav = user.role === "admin" ? ADMIN_NAV : DISTRIBUTOR_NAV;

  return (
    <AppShell user={user} nav={nav}>
      {children}
    </AppShell>
  );
}
