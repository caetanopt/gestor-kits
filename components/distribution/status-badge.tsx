type State = "disponivel" | "entregue" | "bloqueado";

/**
 * Estado da entrega.
 *
 * A cor entra como FUNDO com texto antracite por cima — as cores secundárias
 * da marca não têm contraste para servir de cor de texto, mas todas passam
 * confortavelmente com antracite por cima (4.5:1 a 6.1:1).
 */
const STYLES: Record<State, string> = {
  // Por entregar: contorno dourado, como no convite. Texto em dourado escuro,
  // o único que passa AA sobre branco (5,9:1). Os outros dois estados
  // continuam cheios: pedem atenção, e têm de se distinguir deste à
  // primeira vista.
  disponivel: "border border-dourado-600 text-dourado-700",
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
      className={`inline-flex shrink-0 items-center gap-2 rounded px-3.5 py-1.5 text-sm font-bold tracking-[0.08em] ${STYLES[state]}`}
    >
      <span aria-hidden="true">{ICONS[state]}</span>
      {label}
    </span>
  );
}
