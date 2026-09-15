import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "md" | "lg" | "xl";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-available text-white hover:brightness-110 active:brightness-95 disabled:bg-ink-300",
  secondary:
    "bg-white text-ink-800 ring-1 ring-ink-200 hover:bg-ink-50 disabled:text-ink-400",
  danger:
    "bg-blocked text-white hover:brightness-110 active:brightness-95 disabled:bg-ink-300",
  ghost: "text-ink-600 hover:bg-ink-100 disabled:text-ink-300",
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
