/**
 * Colaboradores acrescentados à mão — no balcão de distribuição ou na
 * página Colaboradores — e não vindos de um ficheiro de importação.
 *
 * A base de dados não guarda a origem na linha do colaborador; guarda-a no
 * histórico. As duas formas de acrescentar à mão (`save_employee` e
 * `create_employee_for_delivery`) registam uma ação EMPLOYEE_CREATED com o
 * colaborador; a importação regista uma única ação EMPLOYEES_IMPORTED para o
 * ficheiro inteiro, sem colaborador. É essa diferença que permite separá-los
 * sem mudar o esquema no dia do evento.
 *
 * Esta função só junta o que as consultas trazem. Fica aqui, sem Supabase,
 * para que as regras — um por colaborador, o mais antigo, sem órfãos — se
 * possam testar.
 */

export type RegistoCriacao = {
  employee_id: string | null;
  performed_by: string | null;
  performed_at: string;
  metadata: unknown;
};

export type PerfilAutor = { id: string; full_name: string | null; email: string | null };

export type LinhaColaborador = {
  id: string | null;
  employee_number: string | null;
  name: string | null;
  email: string | null;
  company_name: string | null;
  kit_delivered: boolean | null;
  delivered_at: string | null;
  delivered_by_name: string | null;
};

export type OrigemManual = "distribuicao" | "colaboradores";

export type ColaboradorManual = {
  employeeNumber: string;
  name: string;
  email: string | null;
  companyName: string;
  createdAt: string;
  createdByName: string | null;
  origem: OrigemManual;
  kitDelivered: boolean;
  deliveredAt: string | null;
  deliveredByName: string | null;
};

/** O balcão marca o registo com `origem: "distribuicao"`; a página não marca. */
function origemDe(metadata: unknown): OrigemManual {
  if (
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).origem === "distribuicao"
  ) {
    return "distribuicao";
  }
  return "colaboradores";
}

export function combinarCriacoesManuais(
  registos: readonly RegistoCriacao[],
  perfis: readonly PerfilAutor[],
  linhas: readonly LinhaColaborador[],
): ColaboradorManual[] {
  const porId = new Map(linhas.filter((l) => l.id).map((l) => [l.id as string, l]));
  const nomeDe = new Map(
    perfis.map((p) => [p.id, p.full_name?.trim() ? p.full_name : (p.email ?? null)]),
  );

  // Um colaborador só é criado uma vez, mas não se confia nisso: fica o
  // registo mais antigo, que é o da criação.
  const primeiro = new Map<string, RegistoCriacao>();
  for (const r of registos) {
    if (!r.employee_id) continue;
    const anterior = primeiro.get(r.employee_id);
    if (!anterior || r.performed_at < anterior.performed_at)
      primeiro.set(r.employee_id, r);
  }

  const resultado: ColaboradorManual[] = [];
  for (const [id, r] of primeiro) {
    const l = porId.get(id);
    // Registo de alguém que entretanto foi apagado: não há o que exportar.
    if (!l || !l.employee_number || !l.name) continue;

    resultado.push({
      employeeNumber: l.employee_number,
      name: l.name,
      email: l.email,
      companyName: l.company_name ?? "",
      createdAt: r.performed_at,
      createdByName: r.performed_by ? (nomeDe.get(r.performed_by) ?? null) : null,
      origem: origemDe(r.metadata),
      kitDelivered: l.kit_delivered === true,
      deliveredAt: l.delivered_at,
      deliveredByName: l.delivered_by_name,
    });
  }

  // Pela ordem em que foram acrescentados: é a ordem em que alguém os vai
  // querer rever.
  return resultado.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
