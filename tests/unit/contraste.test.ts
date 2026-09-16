import { describe, expect, it } from "vitest";
import { contraste, FUNDO, luminancia, PALETA, TEXTO } from "@/lib/brand/palette";

/**
 * O manual da marca fornece apenas tintas mais claras de cada cor, pensadas
 * para impressão, e nenhuma variante escura. Isso restringe o que pode ser
 * usado como texto no digital.
 *
 * Estes testes fixam as regras que daí decorrem, para que uma alteração
 * futura de cor não introduza texto ilegível sem dar por isso.
 */
const AA = 4.5;

describe("cores da marca como texto", () => {
  it("só o azul profundo e o antracite servem de texto sobre branco", () => {
    expect(contraste(TEXTO.titulo, "#FFFFFF")).toBeGreaterThanOrEqual(AA);
    expect(contraste(TEXTO.corrente, "#FFFFFF")).toBeGreaterThanOrEqual(AA);
    expect(contraste(TEXTO.auxiliar, "#FFFFFF")).toBeGreaterThanOrEqual(AA);
  });

  it("a barra de progresso cumpre o mínimo de elementos não textuais", () => {
    // 3:1 é o limiar para gráficos e componentes de interface, mais baixo que
    // o do texto. O cyan seria a escolha natural para uma barra de progresso
    // e não chega lá — daqui sai a decisão de usar azul profundo.
    expect(contraste(PALETA.azulProfundo, "#FFFFFF")).toBeGreaterThanOrEqual(3);
    expect(contraste(PALETA.azulCyan, "#FFFFFF")).toBeLessThan(3);
  });

  it("as cores secundárias NÃO servem de texto — daí serem usadas como fundo", () => {
    for (const cor of [
      PALETA.azulCyan,
      PALETA.verdeEco,
      PALETA.laranjaDinamico,
      PALETA.amareloLiberdade,
      PALETA.cinzaMedio,
    ]) {
      expect(contraste(cor, "#FFFFFF"), cor).toBeLessThan(AA);
    }
  });

  it("antracite sobre cada cor secundária passa AA", () => {
    for (const cor of [
      PALETA.azulCyan,
      PALETA.verdeEco,
      PALETA.laranjaDinamico,
      PALETA.amareloLiberdade,
    ]) {
      expect(contraste(TEXTO.corrente, cor), cor).toBeGreaterThanOrEqual(AA);
    }
  });

  it("nenhuma cor secundária suporta texto branco", () => {
    for (const cor of [
      PALETA.azulCyan,
      PALETA.verdeEco,
      PALETA.laranjaDinamico,
      PALETA.amareloLiberdade,
    ]) {
      expect(contraste("#FFFFFF", cor), cor).toBeLessThan(AA);
    }
  });
});

describe("pares usados na aplicação", () => {
  const pares: [string, string, string][] = [
    ["título sobre cartão", TEXTO.titulo, FUNDO.cartao],
    ["texto sobre cartão", TEXTO.corrente, FUNDO.cartao],
    ["texto sobre a página", TEXTO.corrente, FUNDO.pagina],
    ["rótulo sobre painel", TEXTO.auxiliar, FUNDO.painel],
    ["botão principal", "#FFFFFF", PALETA.azulProfundo],
    ["botão desativado", TEXTO.auxiliar, FUNDO.desativado],
    ["botão destrutivo", TEXTO.corrente, PALETA.laranjaDinamico],
  ];

  for (const [nome, frente, fundo] of pares) {
    it(`${nome} passa AA`, () => {
      expect(contraste(frente, fundo)).toBeGreaterThanOrEqual(AA);
    });
  }
});

describe("luminancia", () => {
  it("devolve os extremos conhecidos", () => {
    expect(luminancia("#000000")).toBeCloseTo(0, 5);
    expect(luminancia("#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("o contraste entre preto e branco é 21:1", () => {
    expect(contraste("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });

  it("é simétrico", () => {
    expect(contraste("#002E5D", "#FFFFFF")).toBeCloseTo(
      contraste("#FFFFFF", "#002E5D"),
      10,
    );
  });
});
