import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/api/errors";
import { mapPostgrestError } from "@/lib/api/rpc";
import { lerTodasAsPaginas } from "@/lib/supabase/paginar";
import {
  employeeResultSchema,
  type EmployeeFilter,
  type EmployeeCreate,
  type EmployeeInput,
  type EmployeeResult,
  type EmployeeRow,
} from "@/lib/validation/employee";
import {
  combinarCriacoesManuais,
  type ColaboradorManual,
  type LinhaColaborador,
  type PerfilAutor,
} from "@/lib/employees/manuais";

export const EMPLOYEE_PAGE_SIZE = 50;

/**
 * Listagem administrativa de colaboradores.
 *
 * Lê a vista `employee_list`, que é security_invoker: como só administradores
 * conseguem ler `employees`, a listagem também é. O operador continua sem
 * conseguir enumerar colaboradores.
 */
export async function listEmployees(
  filter: EmployeeFilter,
  page = 0,
): Promise<{ rows: EmployeeRow[]; hasMore: boolean }> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("employee_list")
    .select(
      "id, employee_number, name, email, company_id, company_name, kit_delivered, delivered_at, delivered_by_name",
    )
    .order("name", { ascending: true })
    // Um a mais do que cabe na página, para saber se há mais.
    .range(page * EMPLOYEE_PAGE_SIZE, page * EMPLOYEE_PAGE_SIZE + EMPLOYEE_PAGE_SIZE);

  if (filter.companyId) query = query.eq("company_id", filter.companyId);
  if (filter.estado) query = query.eq("kit_delivered", filter.estado === "entregue");
  if (filter.semEmail) query = query.is("email", null);

  if (filter.q) {
    // Pesquisa por número, nome ou email. As vírgulas e parênteses têm
    // significado na sintaxe do PostgREST, por isso são removidas do termo.
    const termo = filter.q.replace(/[,()*]/g, " ").trim();
    if (termo) {
      query = query.or(
        `employee_number.ilike.%${termo}%,name.ilike.%${termo}%,email.ilike.%${termo}%`,
      );
    }
  }

  const { data, error } = await query;
  if (error) throw mapPostgrestError(error);

  const linhas = data ?? [];

  return {
    hasMore: linhas.length > EMPLOYEE_PAGE_SIZE,
    rows: linhas.slice(0, EMPLOYEE_PAGE_SIZE).map((row) => ({
      id: row.id,
      employeeNumber: row.employee_number,
      name: row.name,
      email: row.email,
      companyId: row.company_id,
      companyName: row.company_name,
      kitDelivered: row.kit_delivered,
      deliveredAt: row.delivered_at,
      deliveredByName: row.delivered_by_name,
    })),
  };
}

/**
 * Número vazio recusado com VALIDATION_ERROR: é a base de dados de antes da
 * migração 0020, que ainda o exige. O esquema Zod já validou tudo o resto,
 * por isso não é um erro de quem preencheu — é uma migração por aplicar, e
 * dizê-lo poupa uma procura às cegas no dia do evento.
 */
function semNumeroNaBaseAntiga(erro: AppError, numero: string | null): AppError {
  if (numero === null && erro.code === "VALIDATION_ERROR") {
    return new AppError("DB_OUT_OF_DATE", {
      details: [
        "A base de dados ainda exige o número de colaborador. Falta aplicar a migração 0020.",
      ],
    });
  }
  return erro;
}

/**
 * Cria ou edita um colaborador. Apenas administradores (verificado no SQL).
 * Ao criar, o número pode vir nulo: a base de dados atribui um automático.
 */
export async function saveEmployee(
  input: (EmployeeInput | EmployeeCreate) & { id?: string | undefined },
): Promise<EmployeeResult> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("save_employee", {
    p_id: input.id ?? null,
    p_employee_number: input.employeeNumber,
    p_name: input.name,
    // Campo por preencher e campo vazio são a mesma coisa para a base de
    // dados: um colaborador sem email.
    p_email: input.email ?? null,
    p_company_id: input.companyId,
  });

  if (error) throw semNumeroNaBaseAntiga(mapPostgrestError(error), input.employeeNumber);

  const parsed = employeeResultSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[rpc] resposta inesperada de save_employee", parsed.error.issues);
    throw new AppError("INTERNAL_ERROR");
  }
  return parsed.data;
}

/**
 * Identificadores por pedido. Cada um ocupa 37 caracteres no URL do
 * PostgREST; 100 dão ~4 KB, bem abaixo dos limites de um pedido GET.
 */
const LOTE = 100;

function emLotes<T>(itens: readonly T[]): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += LOTE) lotes.push(itens.slice(i, i + LOTE));
  return lotes;
}

/**
 * Quantos colaboradores foram acrescentados à mão (ver lib/employees/manuais).
 *
 * O histórico só é legível por administradores (RLS), e esta contagem
 * herda essa regra: para outro perfil devolve zero, nunca a contagem real.
 */
export async function countManualEmployees(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("delivery_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", "EMPLOYEE_CREATED")
    .not("employee_id", "is", null);

  if (error) throw mapPostgrestError(error);
  return count ?? 0;
}

/**
 * Colaboradores acrescentados à mão, com os dados atuais de cada um, quem
 * os acrescentou, onde, e o estado do kit.
 *
 * Três leituras em vez de uma com junções: o histórico, as pessoas que
 * interessam e os autores. Todas passam pelo RLS de quem pede — só um
 * administrador lê o histórico e os colaboradores.
 */
export async function listManualEmployees(): Promise<ColaboradorManual[]> {
  const supabase = await createSupabaseServerClient();

  // Por páginas: o Supabase corta cada resposta em 1000 linhas. A ordem por
  // data de criação é aplicada no fim, em combinarCriacoesManuais.
  const lista = await lerTodasAsPaginas(
    (depoisDe: number | null, tamanho) => {
      let query = supabase
        .from("delivery_logs")
        .select("id, employee_id, performed_by, performed_at, metadata")
        .eq("action", "EMPLOYEE_CREATED")
        .not("employee_id", "is", null)
        .order("id", { ascending: true })
        .limit(tamanho);
      if (depoisDe !== null) query = query.gt("id", depoisDe);
      return query;
    },
    (row) => row.id,
  );
  const ids = [
    ...new Set(lista.map((r) => r.employee_id).filter((v): v is string => !!v)),
  ];
  const autores = [
    ...new Set(lista.map((r) => r.performed_by).filter((v): v is string => !!v)),
  ];

  const linhas: LinhaColaborador[] = [];
  for (const lote of emLotes(ids)) {
    const { data, error: erro } = await supabase
      .from("employee_list")
      .select(
        "id, employee_number, name, email, company_name, kit_delivered, delivered_at, delivered_by_name",
      )
      .in("id", lote);
    if (erro) throw mapPostgrestError(erro);
    linhas.push(...(data ?? []));
  }

  const perfis: PerfilAutor[] = [];
  for (const lote of emLotes(autores)) {
    const { data, error: erro } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", lote);
    if (erro) throw mapPostgrestError(erro);
    perfis.push(...(data ?? []));
  }

  return combinarCriacoesManuais(lista, perfis, linhas);
}
