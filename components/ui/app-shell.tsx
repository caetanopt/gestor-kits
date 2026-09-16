import Link from "next/link";
import { signOut } from "@/app/login/actions";
import type { CurrentUser } from "@/lib/auth/dal";

export type NavItem = { href: string; label: string };

/**
 * Navegação visível a cada perfil.
 *
 * Isto é conveniência de interface, não segurança: cada página protege-se a
 * si própria no servidor através de requireUser()/requireAdmin().
 */
export const OPERATOR_NAV: NavItem[] = [{ href: "/distribuicao", label: "Distribuição" }];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/distribuicao", label: "Distribuição" },
  { href: "/admin/empresas", label: "Empresas" },
  { href: "/admin/importar", label: "Importar" },
  { href: "/admin/historico", label: "Histórico" },
];

export function AppShell({
  user,
  nav,
  children,
}: {
  user: CurrentUser;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <header className="border-ink-200 border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <span className="text-ink-900 font-semibold">Distribuição de Kits</span>

          <nav aria-label="Navegação principal" className="flex flex-wrap gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-ink-600 hover:bg-ink-100 hover:text-ink-900 rounded-lg px-3 py-2 text-sm font-medium"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-3">
            <span className="text-ink-500 hidden text-sm sm:inline">
              {user.name}
              {user.role === "admin" && (
                <span className="bg-warning-soft text-ink-700 ms-2 rounded-full px-2 py-0.5 text-xs font-medium">
                  Administrador
                </span>
              )}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-ink-600 hover:bg-ink-100 hover:text-ink-900 rounded-lg px-3 py-2 text-sm font-medium"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
