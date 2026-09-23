import Image from "next/image";

/**
 * Logótipo do evento: "80 Aniversário & Centenário do Fundador — Do nada se
 * fez isto."
 *
 * Extraído do "Save the Date" (PSD) tal como está, sem redesenho. Tem partes
 * do lettering a branco, por isso só pode ser usado sobre o fundo escuro do
 * evento.
 *
 * `priority`: está no topo de todas as páginas, é o maior elemento visível
 * durante o carregamento e não deve chegar depois do resto.
 */
export function LogoEvento({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/evento/logo-80.png"
      alt="80.º Aniversário e Centenário do Fundador — Do nada se fez isto."
      width={814}
      height={245}
      priority
      className={className}
    />
  );
}
