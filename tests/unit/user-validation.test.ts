import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { nameChangeSchema, newUserSchema, userNameSchema } from "@/lib/validation/user";

const CONTA = {
  email: "Miguel.MSantos@Caetano.pt",
  fullName: "Miguel Santos",
  password: "uma-palavra-passe",
  role: "distributor" as const,
};

describe("nome do utilizador", () => {
  it("é obrigatório ao criar uma conta", () => {
    // É o que identifica a pessoa no topo da página: sem ele volta o email,
    // que é precisamente o que se quer deixar de mostrar.
    const semNome = newUserSchema.safeParse({ ...CONTA, fullName: "" });
    expect(semNome.success).toBe(false);
    expect(semNome.error?.issues[0]?.message).toBe("Indique o nome.");

    expect(newUserSchema.safeParse({ ...CONTA, fullName: undefined }).success).toBe(
      false,
    );
  });

  it("só com espaços também não serve", () => {
    expect(userNameSchema.safeParse("   ").success).toBe(false);
  });

  it("limpa os espaços em volta", () => {
    expect(userNameSchema.parse("  Miguel Santos  ")).toBe("Miguel Santos");
  });

  it("recusa um nome demasiado longo", () => {
    expect(userNameSchema.safeParse("a".repeat(160)).success).toBe(true);
    expect(userNameSchema.safeParse("a".repeat(161)).success).toBe(false);
  });

  it("o email continua a ser normalizado para minúsculas", () => {
    const conta = newUserSchema.parse(CONTA);
    expect(conta.email).toBe("miguel.msantos@caetano.pt");
    expect(conta.fullName).toBe("Miguel Santos");
  });

  it("a alteração de nome aceita só o nome", () => {
    expect(nameChangeSchema.parse({ name: " Ana Costa " })).toEqual({
      name: "Ana Costa",
    });
    expect(nameChangeSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

/**
 * A criação e a alteração de contas são só para administradores. Quem impõe
 * a regra em tempo de execução é `requireApiAdmin` nas rotas e `is_admin()`
 * dentro das funções SQL; estes testes são um guarda sobre o código, para que
 * trocar a verificação por uma mais fraca não passe despercebido.
 */
const ler = (caminho: string) => readFileSync(resolve(process.cwd(), caminho), "utf8");

const rotaCriar = ler("app/api/admin/users/route.ts");
const rotaAlterar = ler("app/api/admin/users/[userId]/route.ts");
const pagina = ler("app/(app)/admin/utilizadores/page.tsx");
const migracao = ler("supabase/migrations/0013_nome_do_utilizador.sql");

describe("a gestão de contas é só para administradores", () => {
  it("as rotas exigem perfil de administrador", () => {
    for (const rota of [rotaCriar, rotaAlterar]) {
      expect(rota).toContain("await requireApiAdmin()");
      expect(rota).not.toContain("requireApiSession");
      expect(rota).not.toContain("await requireApiUser()");
    }
  });

  it("a página exige perfil de administrador", () => {
    expect(pagina).toContain("await requireAdmin()");
  });

  it("a função que altera o nome verifica o administrador no SQL", () => {
    // A rota já verifica, mas a função é chamável por qualquer sessão
    // autenticada: sem esta linha, um distribuidor renomeava quem quisesse.
    expect(migracao).toContain("public.is_admin()");
    expect(migracao).toContain("app_error('FORBIDDEN')");
    expect(migracao).toContain("revoke execute on function public.set_user_name");
  });

  it("a alteração do nome fica registada na auditoria", () => {
    expect(migracao).toContain("'USER_RENAMED'");
  });
});
