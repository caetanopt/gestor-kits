import { describe, expect, it } from "vitest";
import { paginar } from "@/lib/ui/paginacao";

describe("contas da paginação", () => {
  it("a primeira página conta a partir de 1", () => {
    const p = paginar(60, 0, 25);
    expect([p.primeiro, p.ultimo]).toEqual([1, 25]);
    expect(p.pageCount).toBe(3);
    expect(p.temAnterior).toBe(false);
    expect(p.temSeguinte).toBe(true);
  });

  it("a última página pára no total e não no múltiplo", () => {
    const p = paginar(60, 2, 25);
    expect([p.primeiro, p.ultimo]).toEqual([51, 60]);
    expect(p.temSeguinte).toBe(false);
    expect(p.temAnterior).toBe(true);
  });

  it("um total exatamente múltiplo não cria uma página vazia no fim", () => {
    const p = paginar(50, 1, 25);
    expect([p.primeiro, p.ultimo]).toEqual([26, 50]);
    expect(p.pageCount).toBe(2);
    expect(p.temSeguinte).toBe(false);
  });

  it("um único registo ocupa a posição 1 de 1", () => {
    const p = paginar(1, 0, 25);
    expect([p.primeiro, p.ultimo, p.pageCount]).toEqual([1, 1, 1]);
    expect(p.temSeguinte).toBe(false);
  });

  it("sem registos há uma página, não zero", () => {
    const p = paginar(0, 0, 25);
    expect(p.pageCount).toBe(1);
    expect([p.primeiro, p.ultimo]).toEqual([0, 0]);
    expect(p.foraDeAlcance).toBe(false);
    expect(p.temSeguinte).toBe(false);
  });

  it("uma página para lá do fim é assinalada, não mostrada como vazia", () => {
    // Acontece com um endereço guardado depois de os filtros mudarem.
    const p = paginar(30, 9, 25);
    expect(p.foraDeAlcance).toBe(true);
    expect(p.pageCount).toBe(2);
    expect([p.primeiro, p.ultimo]).toEqual([0, 0]);
  });

  it("estar na última página não é estar fora de alcance", () => {
    expect(paginar(30, 1, 25).foraDeAlcance).toBe(false);
  });
});
