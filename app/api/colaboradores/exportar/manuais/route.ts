import { toErrorResponse } from "@/lib/api/response";
import { requireApiAdmin } from "@/lib/auth/dal";
import { colaboradoresManuaisParaCsv } from "@/lib/format/csv-export";
import { formatDateTime } from "@/lib/format/date";
import { listManualEmployees } from "@/server/use-cases/employees";

/**
 * GET /api/colaboradores/exportar/manuais
 *
 * CSV com os colaboradores acrescentados à mão — no balcão de distribuição
 * ou na página Colaboradores —, sem os que vieram de um ficheiro de
 * importação. Serve para rever e completar depois do evento os dados de
 * quem não estava na lista.
 *
 * Só administradores, como a exportação geral: leva nomes e emails.
 */
export async function GET() {
  try {
    await requireApiAdmin();

    const pessoas = await listManualEmployees();
    const csv = colaboradoresManuaisParaCsv(pessoas, formatDateTime);

    const hoje = new Date().toISOString().slice(0, 10);
    const nome = `colaboradores-acrescentados-${hoje}.csv`;

    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${nome}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
