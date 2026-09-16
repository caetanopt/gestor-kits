import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/api/errors";
import { mapPostgrestError } from "@/lib/api/rpc";
import {
  companyResultSchema,
  type CompanyInput,
  type CompanyResult,
  type CompanyStockRow,
} from "@/lib/validation/company";

/**
 * Lista as empresas com o respetivo stock.
 *
 * Lê a vista `company_stock`, que deriva o stock das entregas ativas. Uma
 * única consulta para todas as empresas — sem N+1.
 */
export async function listCompanyStock(): Promise<CompanyStockRow[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("company_stock")
    .select("id, name, code, allocated, delivered, available, employee_count")
    .order("name", { ascending: true });

  if (error) throw mapPostgrestError(error);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    allocated: row.allocated,
    delivered: row.delivered,
    available: row.available,
    employeeCount: row.employee_count,
  }));
}

/**
 * Cria ou atualiza uma empresa.
 *
 * A regra "o limite não pode descer abaixo do já entregue" é verificada
 * dentro da transação em `public.save_company`, com a linha da empresa
 * bloqueada — não aqui, onde seria uma condição de corrida.
 */
export async function saveCompany(
  input: CompanyInput & { id?: string | undefined },
): Promise<CompanyResult> {
  // Código ausente: o SQL deriva-o do nome ao criar, ou mantém o existente
  // ao editar.
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("save_company", {
    p_id: input.id ?? null,
    p_name: input.name,
    p_code: input.code ?? null,
    p_allocated_kits: input.allocatedKits,
  });

  if (error) {
    const mapeado = mapPostgrestError(error);

    // O nome e o número de kits já foram validados aqui antes da chamada, por
    // isso um VALIDATION_ERROR vindo do SQL sem código indicado significa
    // quase de certeza que a base de dados ainda tem a versão de
    // `save_company` anterior à migração 0006, que exigia o código.
    //
    // Sem esta mensagem, o sintoma é "os dados enviados são inválidos" num
    // formulário cujos dados estão visivelmente corretos.
    if (mapeado.code === "VALIDATION_ERROR" && !input.code) {
      throw new AppError("VALIDATION_ERROR", {
        details: [
          "Indique um código para a empresa. Para o deixar vazio e ser gerado " +
            "automaticamente, aplique a migração 0006_codigo_automatico.sql na " +
            "base de dados.",
        ],
      });
    }

    throw mapeado;
  }

  const parsed = companyResultSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[rpc] resposta inesperada de save_company", parsed.error.issues);
    throw new AppError("INTERNAL_ERROR");
  }
  return parsed.data;
}
