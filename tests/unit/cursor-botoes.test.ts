import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O Tailwind 4 deixou de pôr `cursor: pointer` nos botões, e o `<button>`
 * nativo tem `cursor: default` — sem estas regras, nada na aplicação parece
 * clicável.
 *
 * O que este ficheiro faz e o que não faz: é uma regra de CSS, e o jsdom não
 * resolve camadas em cascata, por isso não há comportamento a exercitar aqui.
 * O que se guarda é a **lista de controlos cobertos** — perder um seletor
 * numa limpeza do globals.css devolveria esse controlo ao estado de que o
 * utilizador se queixou, e é isso que estas asserções impedem.
 *
 * A prova de que as regras produzem o efeito foi feita no browser, contra o
 * CSS compilado, medindo `getComputedStyle().cursor` com e sem elas: com,
 * cada controlo abaixo dá `pointer`; sem, dá `default`. O contraste importa —
 * uma medição que só olhasse para o estado final leria `pointer` num link
 * mesmo sem folha de estilos nenhuma, porque isso vem do browser.
 */
const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

/** Controlos que têm de continuar a receber a mão. */
const COBERTOS = [
  "button:not(:disabled)",
  "summary",
  '[role="button"]:not([aria-disabled="true"])',
  "select:not(:disabled)",
  'input[type="file"]:not(:disabled)',
  'input[type="checkbox"]:not(:disabled)',
  'input[type="radio"]:not(:disabled)',
  'input[type="submit"]:not(:disabled)',
  'input[type="button"]:not(:disabled)',
  'label:has(> input[type="checkbox"]:not(:disabled))',
  'label:has(> input[type="radio"]:not(:disabled))',
];

describe("cursor dos controlos clicáveis", () => {
  it.each(COBERTOS)("%s recebe cursor de mão", (seletor) => {
    expect(css).toContain(seletor);
  });

  it("o botão que o browser desenha dentro do input de ficheiro também", () => {
    // É um pseudo-elemento: não herda o cursor do input e precisa de regra
    // própria. Foi o último controlo da aplicação a continuar sem mão.
    expect(css).toMatch(
      /input\[type="file"\]::file-selector-button\s*\{\s*cursor:\s*pointer/,
    );
  });

  it("um controlo desativado não convida ao clique", () => {
    // Todo o seletor de estado ativo traz o seu :not(:disabled); sem isso, um
    // botão que não responde ficaria com ar de clicável.
    const ativos = COBERTOS.filter(
      (s) => s.startsWith("input") || s.startsWith("button"),
    );
    for (const seletor of ativos) {
      expect(seletor).toContain(":not(:disabled)");
    }
  });

  it("a etiqueta de um campo de texto fica de fora", () => {
    // A restrição a filho direto de checkbox/radio é o que impede a mão de
    // aparecer sobre a etiqueta de um campo de texto, onde seria mentira.
    expect(css).not.toMatch(/label:has\(>\s*input\)/);
    expect(css).not.toMatch(/^\s*label\s*\{[^}]*cursor:\s*pointer/m);
  });
});
