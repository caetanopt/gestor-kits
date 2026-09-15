import type { ReactNode } from "react";

type Tone = "info" | "success" | "error" | "warning";

const TONES: Record<Tone, { box: string; icon: string }> = {
  info: { box: "bg-available-soft text-ink-800 ring-available/30", icon: "ℹ" },
  success: { box: "bg-delivered-soft text-ink-800 ring-delivered/30", icon: "✓" },
  error: { box: "bg-blocked-soft text-ink-800 ring-blocked/30", icon: "✕" },
  warning: { box: "bg-warning-soft text-ink-800 ring-warning/40", icon: "!" },
};

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
}) {
  const { box, icon } = TONES[tone];
  return (
    <div
      // `alert` anuncia imediatamente em leitores de ecrã; usado apenas para
      // erros e confirmações, não para conteúdo decorativo.
      role={tone === "error" ? "alert" : "status"}
      className={`flex gap-3 rounded-xl px-4 py-3 ring-1 ${box}`}
    >
      <span aria-hidden="true" className="mt-0.5 font-bold">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-sm">{children}</div>}
      </div>
    </div>
  );
}
