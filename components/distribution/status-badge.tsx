type State = "available" | "delivered" | "blocked";

const STYLES: Record<State, string> = {
  available: "bg-available-soft text-available ring-available/30",
  delivered: "bg-delivered-soft text-delivered ring-delivered/30",
  blocked: "bg-blocked-soft text-blocked ring-blocked/30",
};

// Um símbolo acompanha sempre a cor: o estado não pode depender só de cor
// (WCAG 1.4.1).
const ICONS: Record<State, string> = {
  available: "○",
  delivered: "✓",
  blocked: "✕",
};

export function StatusBadge({ state, label }: { state: State; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-base font-bold ring-1 ${STYLES[state]}`}
    >
      <span aria-hidden="true">{ICONS[state]}</span>
      {label}
    </span>
  );
}
