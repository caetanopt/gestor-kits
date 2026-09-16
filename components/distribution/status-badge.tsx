type State = "disponivel" | "entregue" | "bloqueado";

/**
 * Estado da entrega.
 *
 * A cor entra como FUNDO com texto antracite por cima — as cores secundárias
 * da marca não têm contraste para servir de cor de texto, mas todas passam
 * confortavelmente com antracite por cima (4.5:1 a 6.1:1).
 */
const STYLES: Record<State, string> = {
  disponivel: "bg-cyan-500 text-ink-800",
  entregue: "bg-eco-500 text-ink-800",
  bloqueado: "bg-laranja-500 text-ink-800",
};

// Um símbolo acompanha sempre a cor: o estado não pode depender só de cor
// (WCAG 1.4.1).
const ICONS: Record<State, string> = {
  disponivel: "○",
  entregue: "✓",
  bloqueado: "✕",
};

export function StatusBadge({ state, label }: { state: State; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-base font-bold tracking-wide ${STYLES[state]}`}
    >
      <span aria-hidden="true">{ICONS[state]}</span>
      {label}
    </span>
  );
}
