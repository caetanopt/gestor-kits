import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { combinarCriacoesManuais, type LinhaColaborador } from "@/lib/employees/manuais";
import { colaboradoresManuaisParaCsv } from "@/lib/format/csv-export";

const linha = (id: string, extra: Partial<LinhaColaborador> = {}): LinhaColaborador => ({
  id,
  employee_number: `N${id}`,
  name: `Pessoa ${id}`,
  email: null,
  company_name: "Caetano Automotive PT,SA",
  kit_delivered: false,
  delivered_at: null,
  delivered_by_name: null,
  ...extra,
});

describe("colaboradores acrescentados à mão", () => {
  it("distingue o balcão da página Colaboradores pela marca no registo", () => {
    const r = combinarCriacoesManuais(
      [
        {
          employee_id: "a",
          performed_by: "u1",
          performed_at: "2026-09-23T15:00:00Z",
          metadata: { origem: "distribuicao" },
        },
        {
          employee_id: "b",
          performed_by: "u1",
          performed_at: "2026-09-23T15:01:00Z",
          metadata: { name: "x" },
        },
      ],
      [{ id: "u1", full_name: "Ana Ribeiro", email: "ana@x.pt" }],
      [linha("a"), linha("b")],
    );
    expect(r.map((p) => p.origem)).toEqual(["distribuicao", "colaboradores"]);
    expect(r[0]!.createdByName).toBe("Ana Ribeiro");
  });

  it("ignora quem entretanto foi apagado e registos sem colaborador", () => {
    const r = combinarCriacoesManuais(
      [
        {
          employee_id: "apagado",
          performed_by: null,
          performed_at: "2026-09-23T15:00:00Z",
          metadata: {},
        },
        {
          employee_id: null,
          performed_by: null,
          performed_at: "2026-09-23T15:00:00Z",
          metadata: {},
        },
        {
          employee_id: "a",
          performed_by: null,
          performed_at: "2026-09-23T15:02:00Z",
          metadata: {},
        },
      ],
      [],
      [linha("a")],
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.createdByName).toBeNull();
  });

  it("um por colaborador, com a data da criação, por ordem de criação", () => {
    const r = combinarCriacoesManuais(
      [
        {
          employee_id: "b",
          performed_by: null,
          performed_at: "2026-09-23T15:05:00Z",
          metadata: {},
        },
        {
          employee_id: "a",
          performed_by: null,
          performed_at: "2026-09-23T15:03:00Z",
          metadata: {},
        },
        {
          employee_id: "a",
          performed_by: null,
          performed_at: "2026-09-23T15:01:00Z",
          metadata: {},
        },
      ],
      [],
      [linha("a"), linha("b")],
    );
    expect(r.map((p) => p.employeeNumber)).toEqual(["Na", "Nb"]);
    expect(r[0]!.createdAt).toBe("2026-09-23T15:01:00Z");
  });

  it("usa o email de quem acrescentou quando não há nome", () => {
    const r = combinarCriacoesManuais(
      [
        {
          employee_id: "a",
          performed_by: "u2",
          performed_at: "2026-09-23T15:00:00Z",
          metadata: {},
        },
      ],
      [{ id: "u2", full_name: " ", email: "joao@x.pt" }],
      [linha("a")],
    );
    expect(r[0]!.createdByName).toBe("joao@x.pt");
  });

  it("gera um CSV com cabeçalho, origem legível e total", () => {
    const [p] = combinarCriacoesManuais(
      [
        {
          employee_id: "a",
          performed_by: "u1",
          performed_at: "2026-09-23T15:00:00Z",
          metadata: { origem: "distribuicao" },
        },
      ],
      [{ id: "u1", full_name: "Ana Ribeiro", email: null }],
      [
        linha("a", {
          email: "=cmd@x.pt",
          kit_delivered: true,
          delivered_at: "2026-09-23T15:10:00Z",
          delivered_by_name: "Ana Ribeiro",
        }),
      ],
    );
    const csv = colaboradoresManuaisParaCsv([p!], () => "23/09/2026");
    const linhas = csv.replace(/^\uFEFF/, "").split("\r\n");
    expect(linhas[0]).toBe(
      "N.º colaborador;Nome;Email;Empresa;Acrescentado em;Acrescentado por;Onde;Kit entregue;Data de entrega;Entregue por",
    );
    expect(linhas[1]).toBe(
      "Na;Pessoa a;'=cmd@x.pt;Caetano Automotive PT,SA;23/09/2026;Ana Ribeiro;Balcão de distribuição;Sim;23/09/2026;Ana Ribeiro",
    );
    expect(linhas).toContain("Total;1");
  });
});

describe("a exportação dos acrescentados é só para administradores", () => {
  const rota = readFileSync(
    resolve(process.cwd(), "app/api/colaboradores/exportar/manuais/route.ts"),
    "utf8",
  );
  const pagina = readFileSync(
    resolve(process.cwd(), "app/(app)/admin/colaboradores/page.tsx"),
    "utf8",
  );

  it("a rota exige perfil de administrador", () => {
    expect(rota).toContain("await requireApiAdmin()");
    expect(rota).not.toContain("requireApiSession");
  });

  it("a ligação vive numa página só de administradores", () => {
    expect(pagina).toContain("/api/colaboradores/exportar/manuais");
    expect(pagina).toContain("await requireAdmin()");
  });
});
