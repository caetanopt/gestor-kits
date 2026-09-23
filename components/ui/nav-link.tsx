"use client";

import { usePathname } from "next/navigation";
import { ProgressLink } from "@/components/ui/route-progress";

/**
 * Ligação do menu principal, com a página atual assinalada.
 *
 * Client Component só por causa do `usePathname`: o cabeçalho vive no layout,
 * que não volta a ser desenhado quando se muda de página, por isso o servidor
 * não pode saber qual das ligações está ativa.
 *
 * A página atual não é indicada só pela cor: leva também um traço por baixo,
 * e `aria-current` para leitores de ecrã.
 */
export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const ativa = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <ProgressLink
      href={href}
      aria-current={ativa ? "page" : undefined}
      className={`inline-flex min-h-11 touch-manipulation items-center rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition duration-100 select-none hover:bg-white/10 active:scale-[0.97] active:bg-white/15 has-[[data-navegacao-pendente]]:bg-white/10 motion-reduce:active:scale-100 ${
        ativa
          ? "text-dourado-300 decoration-dourado-500 underline decoration-2 underline-offset-8"
          : "text-ink-700 hover:text-white"
      }`}
    >
      {label}
    </ProgressLink>
  );
}
