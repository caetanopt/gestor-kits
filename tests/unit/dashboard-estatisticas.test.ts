import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { percent, somarTotais } from "@/lib/ui/totais";

const dashboard = readFileSync(
  resolve(process.cwd(), "app/(app)/dashboard/page.tsx"),
  "utf8",
);

describe("somarTotais", () => {
  it("soma entregues e colaboradores de todas as empresas", () => {
    const totals = somarTotais([
      { delivered: 12, employeeCount: 40 },
      { delivered: 3, employeeCount: 10 },
    ]);
    expect(totals.delivered).toBe(15);
    expect(totals.employees).toBe(50);
  });

  it("os colaboradores sem kit são o que falta entregar", () => {
    expect(somarTotais([{ delivered: 1, employeeCount: 2253 }]).porEntregar).toBe(2252);
    expect(somarTotais([{ delivered: 40, employeeCount: 40 }]).porEntregar).toBe(0);
  });

  it("nunca mostra um número negativo", () => {
    // Não devia acontecer — uma entrega pertence sempre a um colaborador —
    // mas se acontecesse, "-3 sem kit" seria pior do que zero.
    expect(somarTotais([{ delivered: 3, employeeCount: 0 }]).porEntregar).toBe(0);
  });

  it("sem empresas, tudo a zero", () => {
    expect(somarTotais([])).toEqual({ delivered: 0, employees: 0, porEntregar: 0 });
  });
});

describe("percent", () => {
  it("não divide por zero numa empresa sem colaboradores", () => {
    expect(percent(0, 0)).toBe(0);
  });

  it("arredonda a percentagem levantada", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(40, 40)).toBe(100);
  });
});

describe("o cartão do topo", () => {
  it("mostra os colaboradores sem kit e já não as entregas da última hora", () => {
    expect(dashboard).toContain('label="Colaboradores sem kit"');
    expect(dashboard).not.toContain("última hora");
  });

  it("não paga uma consulta extra para o saber", () => {
    // O número sai dos totais por empresa que a página já carrega.
    expect(dashboard).toContain("value={totals.porEntregar}");
    expect(dashboard).not.toContain("countDeliveriesLastHour");
  });
});
