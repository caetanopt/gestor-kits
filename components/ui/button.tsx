import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "md" | "lg" | "xl";

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
    "bg-azul-900 text-white hover:bg-azul-700 disabled:bg-ink-200 disabled:text-ink-700",
  secondary:
    "bg-white text-ink-900 ring-1 ring-ink-300 hover:bg-ink-50 disabled:text-ink-700",
  danger:
    "bg-laranja-500 text-ink-800 hover:bg-laranja-300 disabled:bg-ink-200 disabled:text-ink-700",
  ghost: "text-ink-700 hover:bg-ink-100 disabled:text-ink-700",
};

const SIZES: Record<Size, string> = {
  md: "px-4 py-2.5 text-sm rounded-lg",
  lg: "px-6 py-3.5 text-base rounded-xl",
  // Alvo generoso para utilização com o dedo em tablet durante o evento.
  xl: "px-8 py-6 text-xl rounded-2xl",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-semibold transition disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
