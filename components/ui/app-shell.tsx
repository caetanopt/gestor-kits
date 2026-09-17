import { ProgressLink, RouteProgress } from "@/components/ui/route-progress";
import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { isAuthBypassEnabled } from "@/lib/auth/bypass";
import { CaetanoLogo } from "@/components/brand/caetano-logo";
import type { CurrentUser } from "@/lib/auth/dal";

export type NavItem = { href: string; label: string };

/**
 * Navegação visível a cada perfil.
 *
 * Isto é conveniência de interface, não segurança: cada página protege-se a
 * si própria no servidor através de requireUser()/requireAdmin().
 */
export const DISTRIBUTOR_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/distribuicao", label: "Distribuição" },
];

export const ADMIN_NAV: NavItem[] = [
  ...DISTRIBUTOR_NAV,
  { href: "/admin/empresas", label: "Empresas" },
  { href: "/admin/colaboradores", label: "Colaboradores" },
  { href: "/admin/historico", label: "Histórico" },
  { href: "/admin/utilizadores", label: "Utilizadores" },
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
      <RouteProgress />

      {/* Aviso deliberadamente impossível de ignorar: enquanto a autenticação
          estiver desativada, qualquer pessoa com o URL entra. */}
      {isAuthBypassEnabled() && (
        <div
          role="alert"
          className="bg-laranja-500 text-ink-800 px-4 py-2 text-center text-sm font-semibold"
        >
          ⚠ Autenticação desativada — qualquer pessoa com este endereço tem acesso total.
          Não usar com dados reais.
        </div>
      )}

      <header className="border-ink-200 border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <CaetanoLogo className="text-azul-900 h-5 w-auto" />
            <span
              aria-hidden="true"
              className="bg-ink-200 hidden h-5 w-px sm:inline-block"
            />
            <span className="text-ink-700 hidden text-sm font-medium sm:inline">
              Distribuição de Kits
            </span>
          </div>

          {/* `order-last w-full` abaixo de lg: com seis itens de menu, a
              navegação não cabe na mesma fila que o logótipo e a conta, e sem
              isto era o botão Sair que ia sozinho para uma terceira fila.
              Medido a 768: cabeçalho de 149px para 125px. */}
          <nav
            aria-label="Navegação principal"
            className="order-last flex w-full flex-wrap gap-x-1 gap-y-2 lg:order-none lg:w-auto"
          >
            {nav.map((item) => (
              <ProgressLink
                key={item.href}
                href={item.href}
                className="text-ink-700 hover:bg-ink-100 hover:text-ink-900 active:bg-ink-200 has-[[data-navegacao-pendente]]:bg-ink-100 has-[[data-navegacao-pendente]]:text-ink-900 inline-flex min-h-11 touch-manipulation items-center rounded-lg px-3 py-2 text-sm font-medium transition duration-100 select-none active:scale-[0.97] motion-reduce:active:scale-100"
              >
                {item.label}
              </ProgressLink>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-3">
            <span className="text-ink-700 text-sm">
              <span className="hidden sm:inline">{user.name}</span>
              {user.role === "admin" && (
                <span className="bg-amarelo-100 text-ink-800 rounded-full px-2 py-0.5 text-xs font-medium sm:ms-2">
                  Administrador
                </span>
              )}
            </span>
            {/* Sem o botão quando a autenticação está desativada: o proxy
                voltaria a iniciar sessão no pedido seguinte. */}
            {!isAuthBypassEnabled() && (
              <form action={signOut}>
                <Button type="submit" variant="ghost">
                  Sair
                </Button>
              </form>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
