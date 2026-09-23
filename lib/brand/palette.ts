/**
 * Paleta Caetano — Brand Book, abril 2026 (secção 04.2).
 *
 * Fonte única dos valores usados em `app/globals.css`. Existe em TypeScript
 * para que os rácios de contraste possam ser verificados por testes, em vez
 * de dependerem de inspeção visual.
 */
export const PALETA = {
  azulProfundo: "#002E5D",
  cinzaAntracite: "#2E3A46",
  cinzaMedio: "#9CAEB8",
  azulCyan: "#00AEEF",
  verdeEco: "#49B489",
  laranjaDinamico: "#FFA931",
  amareloLiberdade: "#FFD23F",
  claim: "#2AA8E0",
} as const;

/** Tons de texto. Só estes três passam AA sobre fundos claros. */
export const TEXTO = {
  titulo: "#002E5D",
  corrente: "#2E3A46",
  auxiliar: "#58616B",
} as const;

export const FUNDO = {
  pagina: "#EBEFF1",
  cartao: "#FFFFFF",
  painel: "#F5F8F9",
  desativado: "#D7DFE3",
} as const;

/**
 * Identidade do evento: 80.º Aniversário e Centenário do Fundador.
 *
 * Cores tiradas do "Save the Date" (PSD): o azul mais escuro do fundo e os
 * dois dourados do lettering. O fundo é liso, sem o degradê para azul claro
 * do convite: por cima de um fundo que muda de cor, o mesmo texto passa e
 * deixa de passar nos rácios de contraste conforme a zona do ecrã.
 */
export const EVENTO = {
  fundo: "#000E2C",
  dourado: "#FFD483",
  douradoForte: "#F4B15F",
  /** Texto sobre o fundo do evento: títulos, corrente e auxiliar. */
  textoTitulo: "#FFFFFF",
  textoCorrente: "#E6ECF2",
  textoAuxiliar: "#C9D3DA",
} as const;

/** Luminância relativa, segundo a definição da WCAG 2.2. */
export function luminancia(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rácio de contraste entre duas cores, de 1:1 a 21:1. */
export function contraste(a: string, b: string): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (claro + 0.05) / (escuro + 0.05);
}
