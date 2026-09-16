import type { ReactNode } from "react";

type Tone = "info" | "success" | "error" | "warning";

/**
 * Caixas de aviso.
 *
 * O fundo é sempre uma tinta clara da marca e o texto é antracite. Nenhuma
 * cor secundária é usada como cor de texto: sobre branco, todas ficam abaixo
 * de 2.6:1 de contraste. A cor entra na barra lateral e no símbolo.
 */
const TONES: Record<Tone, { box: string; bar: string; icon: string }> = {
  info: { box: "bg-cyan-100 text-ink-800", bar: "bg-cyan-500", icon: "i" },
  success: { box: "bg-eco-100 text-ink-800", bar: "bg-eco-500", icon: "✓" },
  error: { box: "bg-laranja-100 text-ink-800", bar: "bg-laranja-500", icon: "!" },
  warning: { box: "bg-amarelo-100 text-ink-800", bar: "bg-amarelo-500", icon: "!" },
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
  const { box, bar, icon } = TONES[tone];

  return (
    <div
      // `alert` anuncia imediatamente em leitores de ecrã; usado apenas para
      // erros, não para conteúdo informativo.
      role={tone === "error" ? "alert" : "status"}
      className={`flex gap-3 overflow-hidden rounded-xl ${box}`}
    >
      <span aria-hidden="true" className={`w-1.5 shrink-0 ${bar}`} />
      <div className="flex min-w-0 flex-1 gap-3 py-3 pr-4">
        <span
          aria-hidden="true"
          className={`text-ink-800 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${bar}`}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          {title && <p className="text-ink-900 font-semibold">{title}</p>}
          {children && <div className="text-sm">{children}</div>}
        </div>
      </div>
    </div>
  );
}
