import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

/**
 * O jsdom não avalia `:active`, por isso o efeito em si não é testável aqui.
 * O que se guarda é a presença das classes: o evento corre em tablet, onde
 * não há hover nenhum, e perder estas classes numa reescrita do className
 * devolvia os botões ao estado em que um toque não mudava nada — que foi
 * exatamente o defeito relatado.
 */
const VARIANTES = ["primary", "secondary", "danger", "ghost"] as const;

describe("resposta ao toque nos botões", () => {
  it.each(VARIANTES)("a variante %s encolhe e escurece ao ser premida", (variant) => {
    render(<Button variant={variant}>Tocar</Button>);
    const classes = screen.getByRole("button").className;

    expect(classes).toContain("active:scale-[0.97]");
    expect(classes).toContain("active:brightness-95");
    // Cada variante muda também de fundo: com o dedo por cima do botão, a
    // escala sozinha pode não ser visível.
    expect(classes).toMatch(/active:bg-/);
  });

  it("não espera pelo duplo toque nem seleciona o rótulo", () => {
    render(<Button>Tocar</Button>);
    const classes = screen.getByRole("button").className;

    expect(classes).toContain("touch-manipulation");
    expect(classes).toContain("select-none");
  });

  it("quem pediu menos movimento mantém a cor e perde a escala", () => {
    render(<Button>Tocar</Button>);
    const classes = screen.getByRole("button").className;

    expect(classes).toContain("motion-reduce:active:scale-100");
    expect(classes).toContain("active:bg-azul-700");
  });

  it("um className próprio não substitui a resposta ao toque", () => {
    render(<Button className="w-full">Tocar</Button>);
    const classes = screen.getByRole("button").className;

    expect(classes).toContain("w-full");
    expect(classes).toContain("active:scale-[0.97]");
  });
});
