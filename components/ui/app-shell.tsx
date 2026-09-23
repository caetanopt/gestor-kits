import { RouteProgress } from "@/components/ui/route-progress";
import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { isAuthBypassEnabled } from "@/lib/auth/bypass";
import { LogoEvento } from "@/components/brand/logo-evento";
import { NavLink } from "@/components/ui/nav-link";
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

/**
 * Moldura dourada do evento: um filete à volta da página e cantos marcados.
 *
 * Decorativa (aria-hidden) e sem receber cliques. Acompanha a altura da
 * página inteira em vez de ficar presa ao ecrã, porque o logótipo interrompe
 * o filete de cima: com a moldura fixa, ao rolar, o logótipo afastava-se e o
 * corte no filete ficava a flutuar vazio.
 *
 * Não aparece no telemóvel, onde os 16 px de cada lado fazem falta ao
 * conteúdo.
 */
function Moldura() {
  const canto = "border-dourado-300 absolute size-6";
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-4 hidden sm:block"
    >
      <div className="border-dourado-500/50 absolute inset-0 border" />
      <span className={`${canto} -top-1.5 -left-1.5 border-t-[3px] border-l-[3px]`} />
      <span className={`${canto} -top-1.5 -right-1.5 border-t-[3px] border-r-[3px]`} />
      <span className={`${canto} -bottom-1.5 -left-1.5 border-b-[3px] border-l-[3px]`} />
      <span className={`${canto} -right-1.5 -bottom-1.5 border-r-[3px] border-b-[3px]`} />
    </div>
  );
}

export function AppShell({
  user,
  nav,
  children,
}: {
  user: CurrentUser;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  /**
   * Onde vai o menu.
   *
   * Com duas opções (distribuidor), o menu cabe à esquerda do logótipo,
   * como na proposta. Com seis (administrador) não cabe: medido a 1280 px,
   * o espaço de cada lado do logótipo é ~500 px e as seis opções ocupam
   * ~600. Em vez de as deixar partir, o menu passa para uma linha própria
   * por baixo do logótipo. As opções nunca quebram a meio
   * (`whitespace-nowrap`); num ecrã estreito, passam inteiras para a linha
   * seguinte.
   */
  const menuAoLado = nav.length <= 3;

  return (
    <div className="tema-evento relative min-h-dvh">
      <RouteProgress />
      <Moldura />

      {/* Aviso deliberadamente impossível de ignorar: enquanto a autenticação
          estiver desativada, qualquer pessoa com o URL entra. */}
      {isAuthBypassEnabled() && (
        <div
          role="alert"
          className="bg-laranja-500 text-ink-800 relative px-4 py-2 text-center text-sm font-semibold"
        >
          ⚠ Autenticação desativada — qualquer pessoa com este endereço tem acesso total.
          Não usar com dados reais.
        </div>
      )}

      <header className="relative px-4 pt-3 sm:px-10 sm:pt-1">
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-3">
          {/* O fundo por trás do logótipo corta o filete de cima da moldura,
              como numa moldura de certificado. */}
          <div className="bg-evento-fundo col-start-2 row-start-1 px-3 sm:px-5">
            <LogoEvento className="h-10 w-auto sm:h-14 md:h-16" />
          </div>

          <nav
            aria-label="Navegação principal"
            className={`col-span-3 row-start-2 flex flex-wrap justify-center gap-x-1 gap-y-1 ${
              menuAoLado
                ? "lg:col-span-1 lg:col-start-1 lg:row-start-1 lg:justify-start"
                : "border-dourado-500/25 border-t pt-2"
            }`}
          >
            {nav.map((item) => (
              <NavLink key={item.href} href={item.href} label={item.label} />
            ))}
          </nav>

          <div className="col-start-3 row-start-1 flex min-w-0 items-center justify-end gap-3">
            {/* O nome só a partir de md: abaixo disso não cabe ao lado do
                logótipo, e truncado para um nome comprido não empurrar o
                botão Sair para fora do ecrã. */}
            <span className="text-ink-800 hidden min-w-0 truncate text-sm md:inline">
              {user.name}
            </span>
            {user.role === "admin" && (
              <span className="text-dourado-300 ring-dourado-500/60 hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 lg:inline">
                Administrador
              </span>
            )}
            {/* Sem o botão quando a autenticação está desativada: o proxy
                voltaria a iniciar sessão no pedido seguinte. */}
            {!isAuthBypassEnabled() && (
              <form action={signOut} className="shrink-0">
                <Button type="submit" variant="sobreEscuro">
                  Sair
                </Button>
              </form>
            )}
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 py-6 sm:px-10 sm:pb-12">
        {children}
      </main>
    </div>
  );
}
