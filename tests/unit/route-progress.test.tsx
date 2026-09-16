import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { RouteProgress } from "@/components/ui/route-progress";
import {
  abrirNavegacao,
  haNavegacaoPendente,
  reporNavegacao,
} from "@/lib/ui/navegacao-pendente";

/**
 * A barra é conduzida por temporizadores, que é onde este género de
 * componente costuma falhar: aparecer em navegações instantâneas, ou ficar
 * preso no ecrã quando a navegação termina.
 */
const barra = () => document.querySelector("[aria-hidden='true'].fixed");

beforeEach(() => {
  vi.useFakeTimers();
  reporNavegacao();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("contagem de navegações pendentes", () => {
  it("duas navegações ao mesmo tempo só terminam quando ambas fecham", () => {
    const fecharPrimeira = abrirNavegacao();
    const fecharSegunda = abrirNavegacao();
    expect(haNavegacaoPendente()).toBe(true);

    fecharPrimeira();
    expect(haNavegacaoPendente()).toBe(true);

    fecharSegunda();
    expect(haNavegacaoPendente()).toBe(false);
  });

  it("fechar duas vezes não torna a contagem negativa", () => {
    const fechar = abrirNavegacao();
    fechar();
    fechar();
    expect(haNavegacaoPendente()).toBe(false);

    // Se a contagem tivesse ido a -1, esta navegação não mostraria a barra.
    abrirNavegacao();
    expect(haNavegacaoPendente()).toBe(true);
  });
});

describe("barra de progresso", () => {
  it("não aparece numa navegação instantânea", () => {
    render(<RouteProgress />);
    const fechar = abrirNavegacao();

    act(() => {
      vi.advanceTimersByTime(80);
    });
    act(() => fechar());
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(barra()).toBeNull();
  });

  it("aparece quando a navegação se arrasta", () => {
    render(<RouteProgress />);
    act(() => {
      abrirNavegacao();
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(barra()).not.toBeNull();
  });

  it("avança sem nunca chegar ao fim sozinha", () => {
    render(<RouteProgress />);
    act(() => {
      abrirNavegacao();
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    const escala = () => {
      const interior = barra()?.firstElementChild as HTMLElement;
      return Number(/scaleX\(([\d.]+)\)/.exec(interior.style.transform)?.[1]);
    };

    const inicial = escala();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    const depois = escala();

    expect(depois).toBeGreaterThan(inicial);

    // Muito tempo depois continua abaixo do teto: o fim é a página chegar,
    // não o temporizador esgotar-se.
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(escala()).toBeLessThan(0.9);
  });

  it("sai do ecrã quando a navegação termina", () => {
    render(<RouteProgress />);
    let fechar = () => {};
    act(() => {
      fechar = abrirNavegacao();
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(barra()).not.toBeNull();

    act(() => fechar());
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(barra()).toBeNull();
  });

  it("uma navegação nova depois de outra volta a mostrar a barra", () => {
    render(<RouteProgress />);

    let fechar = () => {};
    act(() => {
      fechar = abrirNavegacao();
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => fechar());
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(barra()).toBeNull();

    act(() => {
      abrirNavegacao();
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(barra()).not.toBeNull();
  });

  it("é invisível para leitores de ecrã", () => {
    render(<RouteProgress />);
    act(() => {
      abrirNavegacao();
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(barra()?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
