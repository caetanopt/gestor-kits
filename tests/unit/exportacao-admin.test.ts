import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A exportação leva nomes e emails de toda a gente, por isso é só para
 * administradores — no servidor e na interface.
 *
 * Quem impõe a regra em tempo de execução é `requireApiAdmin`, que lança
 * FORBIDDEN para qualquer outro perfil. Estes testes não a re-executam: são um
 * guarda sobre o código, para que trocar a verificação por uma mais fraca, ou
 * esquecer a condição na interface, não passe despercebido.
 */
const ler = (caminho: string) => readFileSync(resolve(process.cwd(), caminho), "utf8");

const rota = ler("app/api/colaboradores/exportar/route.ts");
const dashboard = ler("app/(app)/dashboard/page.tsx");

describe("a exportação é só para administradores", () => {
  it("a rota exige perfil de administrador", () => {
    expect(rota).toContain("await requireApiAdmin()");
  });

  it("e não se contenta com uma verificação mais fraca", () => {
    // requireApiSession só confirma que há sessão; requireApiUser aceita
    // qualquer perfil ativo. Nenhuma das duas serve aqui.
    expect(rota).not.toContain("requireApiSession");
    expect(rota).not.toContain("await requireApiUser()");
  });

  it("nenhuma ligação de exportação escapa à condição de administrador", () => {
    // Cada href para a rota tem de estar dentro de um ramo que a exija.
    const ligacoes = dashboard.match(/\/api\/colaboradores\/exportar/g) ?? [];
    expect(ligacoes.length).toBeGreaterThan(0);

    const guardas = dashboard.match(/user\.role === "admin"/g) ?? [];
    expect(guardas.length).toBeGreaterThanOrEqual(ligacoes.length);
  });

  it("o dashboard lê o perfil de quem está autenticado", () => {
    // Sem isto, `user` viria de outro sítio e a condição não diria nada.
    expect(dashboard).toContain("const user = await requireUser()");
  });
});
