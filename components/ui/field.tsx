import type { InputHTMLAttributes, ReactNode } from "react";

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
        <p id={hintId} className="text-ink-500 text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-blocked text-sm font-medium">
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
      className={`text-ink-900 ring-ink-200 placeholder:text-ink-400 focus:ring-available disabled:bg-ink-100 w-full rounded-lg bg-white px-3.5 py-2.5 ring-1 focus:ring-2 ${className}`}
      {...props}
    />
  );
}
