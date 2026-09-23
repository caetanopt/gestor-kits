import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Select } from "@/components/ui/field";

/**
 * A seta é desenhada por CSS (`.campo-selecao`), e o espaço que ocupa é
 * reservado pelo padding do lado do fim. São duas metades da mesma coisa:
 * sem o padding, uma opção comprida passa por baixo da seta; sem a classe,
 * volta a aparecer a seta nativa colada à borda.
 */
describe("campo de seleção", () => {
  it("desenha a seta própria e reserva-lhe espaço", () => {
    render(
      <Select aria-label="Empresa">
        <option>Caetano Retail</option>
      </Select>,
    );
    const classes = screen.getByRole("combobox").className;

    expect(classes).toContain("campo-selecao");
    expect(classes).toContain("pe-10");
  });

  it("a versão compacta reserva espaço na mesma", () => {
    render(
      <Select compact aria-label="Estado">
        <option>Todos</option>
      </Select>,
    );
    const classes = screen.getByRole("combobox").className;

    expect(classes).toContain("campo-selecao");
    expect(classes).toContain("pe-9");
    expect(classes).toContain("text-sm");
  });

  it("acompanha o Input no filete e na cor do texto", () => {
    render(
      <Select aria-label="Empresa">
        <option>Caetano Retail</option>
      </Select>,
    );
    const classes = screen.getByRole("combobox").className;

    // O foco é o contorno global de :focus-visible, igual em todos os
    // controlos; o campo só tem de não trazer um anel próprio por cima.
    expect(classes).toContain("ring-dourado-200");
    expect(classes).not.toContain("focus:ring");
    expect(classes).toContain("text-ink-900");
  });
});
