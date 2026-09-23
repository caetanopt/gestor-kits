import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | undefined;
  children: ReactNode;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-ink-700 block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && (
        <p id={hintId} className="text-ink-700 text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          className="border-laranja-500 text-ink-800 border-s-3 ps-2 text-sm font-semibold"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      className={`text-ink-900 ring-dourado-200 placeholder:text-ink-700 disabled:bg-ink-100 w-full rounded bg-white px-3.5 py-2.5 ring-1 ${className}`}
      {...props}
    />
  );
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  /** Medidas reduzidas, para as barras de filtros. */
  compact?: boolean;
};

/**
 * Campo de seleção.
 *
 * Existe sobretudo por causa da seta: a nativa encosta-se à borda e ignora o
 * padding (ver `.campo-selecao` em globals.css). O `pe-*` reserva-lhe o
 * espaço, para que uma opção comprida não lhe passe por baixo.
 */
export function Select({ compact = false, className = "", ...props }: SelectProps) {
  const medidas = compact ? "py-2 ps-3 pe-9 text-sm" : "py-2.5 ps-3.5 pe-10";

  return (
    <select
      className={`campo-selecao text-ink-900 ring-dourado-200 disabled:bg-ink-100 w-full rounded bg-white ring-1 ${medidas} ${className}`}
      {...props}
    />
  );
}
