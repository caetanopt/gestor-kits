import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O Tailwind 4 deixou de pôr `cursor: pointer` nos botões, e o `<button>`
 * nativo tem `cursor: default` — sem esta regra, nenhum botão da aplicação
 * parece clicável.
 *
 * É uma regra de CSS, portanto não há comportamento a exercitar aqui: o que
 * se guarda é que não desaparece numa limpeza futura do globals.css. A
 * verificação de que produz mesmo o efeito foi feita no browser, lendo o
 * valor calculado do cursor.
 */
const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

describe("cursor dos botões", () => {
  it("os botões voltam a ter cursor de mão", () => {
    expect(css).toMatch(/button:not\(:disabled\)[\s\S]{0,80}cursor:\s*pointer/);
  });

  it("um botão desativado fica de fora", () => {
    // Sem o :not(:disabled), um botão que não responde convidaria ao clique.
    expect(css).not.toMatch(/^\s*button\s*\{[^}]*cursor:\s*pointer/m);
  });
});
