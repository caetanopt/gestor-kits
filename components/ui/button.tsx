import type { ButtonHTMLAttributes } from "react";

type Variant =
  "primary" | "secondary" | "danger" | "ghost" | "evento" | "sobreEscuro" | "contorno";
type Size = "sm" | "md" | "lg" | "xl";

/**
 * Cores segundo o Brand Book.
 *
 * O azul profundo é a única cor da marca que suporta texto branco com
 * contraste suficiente (13.6:1), por isso é a cor de toda a ação principal —
 * tal como no site institucional.
 *
 * A ação destrutiva usa laranja dinâmico com texto antracite (6.1:1). A
 * paleta não tem vermelho; o laranja é a cor de alerta disponível, e o texto
 * escuro por cima mantém-na legível.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-azul-900 text-white hover:bg-azul-700 active:bg-azul-700 disabled:bg-ink-200 disabled:text-ink-700",
  secondary:
    "bg-white text-ink-900 ring-1 ring-ink-300 hover:bg-ink-50 active:bg-ink-100 disabled:text-ink-700",
  danger:
    "bg-laranja-500 text-ink-800 hover:bg-laranja-300 active:bg-laranja-300 disabled:bg-ink-200 disabled:text-ink-700",
  ghost: "text-ink-700 hover:bg-ink-100 active:bg-ink-200 disabled:text-ink-700",
  // A ação principal do evento, ENTREGAR KIT: o mesmo azul profundo, com o
  // dourado do lettering dos 80 anos no texto e no contorno (9.6:1).
  // Desativado perde o dourado, para não parecer disponível.
  // A ação principal do evento, ENTREGAR KIT, como no convite: azul
  // profundo com texto dourado (9,7:1) e um filete dourado recolhido 1 px
  // da borda. Desativado perde o dourado, para não parecer disponível.
  evento:
    "bg-azul-900 text-dourado-300 font-display tracking-[0.18em] shadow-[inset_0_0_0_1px_var(--color-azul-900),inset_0_0_0_4px_var(--color-dourado-300)] hover:bg-azul-700 active:bg-azul-700 disabled:bg-ink-200 disabled:text-ink-700 disabled:shadow-none",
  // Botão secundário pousado diretamente no fundo escuro do evento, como o
  // Sair do cabeçalho. O ghost não serve aí: o fundo claro do hover ficava
  // por baixo de texto claro.
  // Secundário dos cartões do evento: contorno fino azul profundo, sem
  // enchimento, como o Pesquisar do convite.
  contorno:
    "bg-white text-azul-900 ring-1 ring-azul-900 hover:bg-dourado-50 active:bg-dourado-100 disabled:text-ink-700 disabled:ring-ink-300",
  sobreEscuro:
    "text-white ring-1 ring-white/30 hover:bg-white/10 active:bg-white/15 disabled:text-ink-700",
};

/**
 * Resposta ao toque.
 *
 * O evento corre em tablet, onde não existe hover: sem um estado `active`, um
 * botão tocado não muda absolutamente nada até a ação terminar, e quem o
 * tocou volta a tocá-lo. Cada variante escurece, e todas encolhem — a escala
 * é o sinal que se vê mesmo com o dedo a tapar o botão.
 *
 * `touch-manipulation` dispensa a espera pelo duplo toque para ampliar, que
 * em alguns browsers atrasa o clique o suficiente para parecer perdido.
 * `select-none` evita que arrastar um pouco durante o toque selecione o
 * rótulo em vez de premir.
 *
 * A duração é curta de propósito: 150 ms num estado de pressão já se nota
 * como atraso. Quem pediu menos movimento mantém a cor e perde a escala.
 */
const TOQUE =
  "transition duration-100 touch-manipulation select-none " +
  "active:scale-[0.97] active:brightness-95 motion-reduce:active:scale-100";

const SIZES: Record<Size, string> = {
  // Ações secundárias fora da zona de trabalho, como o Sair do cabeçalho.
  // 36 px de altura: abaixo dos 44 px dos restantes botões, mas acima dos
  // 24 px que a WCAG 2.2 AA exige para alvos de toque.
  sm: "min-h-9 px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-6 py-3.5 text-base",
  // Alvo generoso para utilização com o dedo em tablet durante o evento.
  xl: "px-8 py-6 text-xl",
};

/**
 * Cantos. Separados do tamanho para os cartões do evento poderem pedir
 * cantos retos sem uma segunda classe de raio a disputar com a primeira —
 * no Tailwind, qual de duas ganha depende da ordem no CSS, não no className.
 */
const RAIOS: Record<Size, string> = {
  sm: "rounded-md",
  md: "rounded-lg",
  lg: "rounded-xl",
  xl: "rounded-2xl",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Cantos quase retos (4 px), como nos cartões do evento. */
  retos?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  retos = false,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-semibold disabled:cursor-not-allowed ${TOQUE} ${VARIANTS[variant]} ${SIZES[size]} ${retos ? "rounded" : RAIOS[size]} ${className}`}
      {...props}
    />
  );
}
