import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { lerTodasAsPaginas } from "@/lib/supabase/paginar";

type Linha = { id: string };

/**
 * Um servidor falso com o comportamento do Supabase: devolve as linhas por
 * ordem de `id`, a partir de `depoisDe`, e nunca mais do que `teto` por
 * resposta, peça-se o que se pedir.
 */
function servidor(linhas: Linha[], teto = 1000) {
  const pedidos: { depoisDe: string | null; tamanho: number }[] = [];
  const pagina = async (depoisDe: string | null, tamanho: number) => {
    pedidos.push({ depoisDe, tamanho });
    const ordenadas = [...linhas].sort((a, b) => (a.id < b.id ? -1 : 1));
    const resto =
      depoisDe === null ? ordenadas : ordenadas.filter((l) => l.id > depoisDe);
    return { data: resto.slice(0, Math.min(tamanho, teto)), error: null };
  };
  return { pagina, pedidos };
}

const gerar = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `id-${String(i).padStart(6, "0")}` }));

describe("lerTodasAsPaginas", () => {
  it("lê as 2589 linhas quando o servidor corta cada resposta em 1000", async () => {
    const { pagina, pedidos } = servidor(gerar(2589));
    const todas = await lerTodasAsPaginas(pagina, (l) => l.id);

    expect(todas).toHaveLength(2589);
    expect(new Set(todas.map((l) => l.id)).size).toBe(2589);
    // 1000 + 1000 + 589 + a página vazia que confirma o fim.
    expect(pedidos).toHaveLength(4);
  });

  it("não pára cedo se o servidor tiver um teto mais baixo do que o pedido", async () => {
    // Parar numa página "curta" acabaria aqui ao fim de 500 linhas.
    const { pagina } = servidor(gerar(1200), 500);
    const todas = await lerTodasAsPaginas(pagina, (l) => l.id, { tamanho: 1000 });
    expect(todas).toHaveLength(1200);
  });

  it("sem linhas, devolve uma lista vazia com um só pedido", async () => {
    const { pagina, pedidos } = servidor([]);
    expect(await lerTodasAsPaginas(pagina, (l) => l.id)).toEqual([]);
    expect(pedidos).toHaveLength(1);
  });

  it("alguém acrescentado a meio da leitura não faz saltar nem repetir ninguém", async () => {
    const linhas = gerar(2500);
    let chamadas = 0;
    const base = servidor(linhas);
    const pagina = async (depoisDe: string | null, tamanho: number) => {
      chamadas += 1;
      // Depois da primeira página, entra uma pessoa com um id que já passou.
      if (chamadas === 2) linhas.push({ id: "id-000000a" });
      return base.pagina(depoisDe, tamanho);
    };
    const todas = await lerTodasAsPaginas(pagina, (l) => l.id);
    const ids = todas.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of gerar(2500)) expect(ids).toContain(l.id);
  });

  it("um erro do servidor interrompe a leitura em vez de devolver meia lista", async () => {
    let chamadas = 0;
    const pagina = async () => {
      chamadas += 1;
      if (chamadas === 2) {
        return {
          data: null,
          error: { message: "boom", code: "XX000", details: "", hint: "" },
        };
      }
      return { data: gerar(1000), error: null };
    };
    await expect(
      lerTodasAsPaginas(pagina as never, (l: Linha) => l.id),
    ).rejects.toThrow();
  });

  it("um servidor que devolve sempre a mesma página não prende a leitura", async () => {
    const pagina = async () => ({ data: gerar(1000), error: null });
    await expect(lerTodasAsPaginas(pagina, (l) => l.id)).rejects.toThrow();
  });

  it("acima do máximo é um erro, nunca um corte silencioso", async () => {
    const { pagina } = servidor(gerar(30));
    await expect(
      lerTodasAsPaginas(pagina, (l) => l.id, { tamanho: 10, maximo: 25 }),
    ).rejects.toThrow();
  });

  it("aceita identificadores numéricos, como os do histórico", async () => {
    const linhas = Array.from({ length: 2345 }, (_, i) => ({ id: i + 1 }));
    const pagina = async (depoisDe: number | null, tamanho: number) => ({
      data: linhas
        .filter((l) => depoisDe === null || l.id > depoisDe)
        .slice(0, Math.min(tamanho, 1000)),
      error: null,
    });
    expect(await lerTodasAsPaginas(pagina, (l) => l.id)).toHaveLength(2345);
  });
});

describe("nenhuma leitura grande depende de um único pedido", () => {
  // Guarda sobre o código: um `.range(0, N)` com N grande parece ler N linhas
  // mas o Supabase devolve no máximo 1000. As leituras completas têm de ir
  // por lerTodasAsPaginas; `.range` só nas listagens paginadas no ecrã.
  const pasta = resolve(process.cwd(), "server/use-cases");
  for (const ficheiro of readdirSync(pasta)) {
    it(`${ficheiro} não pede intervalos fixos a partir do zero`, () => {
      const codigo = readFileSync(resolve(pasta, ficheiro), "utf8");
      expect(codigo).not.toMatch(/\.range\(\s*0\s*,/);
    });
  }

  it("as duas exportações leem por páginas", () => {
    const entregas = readFileSync(resolve(pasta, "deliveries.ts"), "utf8");
    const colaboradores = readFileSync(resolve(pasta, "employees.ts"), "utf8");
    expect(entregas).toMatch(/listEmployeesForExport[\s\S]*lerTodasAsPaginas/);
    expect(colaboradores).toMatch(/listManualEmployees[\s\S]*lerTodasAsPaginas/);
  });
});
