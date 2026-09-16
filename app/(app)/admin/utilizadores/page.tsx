import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { canCreateUsers } from "@/lib/supabase/admin";
import { listUsers } from "@/server/use-cases/users";
import { UserManager } from "@/components/admin/user-manager";

export const metadata: Metadata = { title: "Utilizadores · Kits" };
export const dynamic = "force-dynamic";

export default async function UtilizadoresPage() {
  const user = await requireAdmin();
  const users = await listUsers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-ink-900 text-xl font-semibold">Utilizadores</h1>
        <p className="text-ink-700 mt-1 text-sm">
          O <strong>Administrador</strong> tem acesso total. O{" "}
          <strong>Distribuidor</strong> acede apenas ao Dashboard e à Distribuição.
        </p>
      </div>

      <UserManager users={users} currentUserId={user.id} canCreate={canCreateUsers()} />
    </div>
  );
}
