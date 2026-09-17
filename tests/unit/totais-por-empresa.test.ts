import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O dashboard mostrava "Colaboradores 0" a quem entrasse como distribuidor.
 * A contagem não estava errada: a vista `company_totals` era
 * `security_invoker` e o RLS de `employees` só deixa os administradores ler a
 * tabela, por isso a contagem vinha vazia para todos os outros.
 *
 * A correção não abre a tabela — abre um caminho que devolve só os totais.
 * Estes testes guardam as duas metades dessa decisão.
 */
const ler = (caminho: string) => readFileSync(resolve(process.cwd(), caminho), "utf8");

const migracao = ler("supabase/migrations/0014_totais_para_distribuidores.sql");
const rls = ler("supabase/migrations/0002_auth_and_rls.sql");
const casoDeUso = ler("server/use-cases/companies.ts");

describe("totais por empresa", () => {
  it("vêm de uma função e já não da vista", () => {
    expect(casoDeUso).toContain('supabase.rpc("company_totals_list")');
    expect(casoDeUso).not.toContain('from("company_totals")');
    expect(migracao).toContain("drop view if exists public.company_totals");
  });

  it("a função verifica a conta antes de responder", () => {
    // SECURITY DEFINER sem verificação seria dar os números a qualquer
    // sessão, incluindo a de uma conta desativada.
    expect(migracao).toContain("security definer");
    expect(migracao).toContain("app_error('UNAUTHENTICATED')");
    expect(migracao).toContain("app_error('INACTIVE_ACCOUNT')");
    expect(migracao).toContain(
      "revoke execute on function public.company_totals_list() from public, anon",
    );
  });

  it("devolve contagens, nunca linhas de colaboradores", () => {
    // `count(*)` nas duas subconsultas e nenhuma coluna de `employees` na
    // lista de resultado: nome e email não saem daqui.
    const resultado = migracao.slice(
      migracao.indexOf("returns table"),
      migracao.indexOf("language plpgsql"),
    );
    for (const coluna of ["ee.name", "ee.email", "ee.employee_number"]) {
      expect(migracao).not.toContain(coluna);
    }
    expect(resultado).toContain("employee_count integer");
    expect(resultado).not.toContain("email");
  });

  it("a tabela de colaboradores continua reservada aos administradores", () => {
    // Se esta política alguma vez passar a is_active_user(), a correção
    // deixou de ser "só os totais" e passou a ser acesso à lista toda.
    expect(rls).toContain(
      "create policy employees_select_admin on public.employees\n" +
        "  for select to authenticated\n" +
        "  using (public.is_admin());",
    );
  });
});
