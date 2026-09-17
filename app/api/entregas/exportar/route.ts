import type { NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiAdmin } from "@/lib/auth/dal";
import { entregasParaCsv } from "@/lib/format/csv-export";
import { formatDateTime } from "@/lib/format/date";
import { listDeliveredPeople } from "@/server/use-cases/deliveries";

/**
 * GET /api/entregas/exportar[?empresa=<uuid>]
 *
 * Documento com quem recebeu kit. Devolve CSV em vez do envelope JSON
 * habitual — é um ficheiro para descarregar, não uma resposta para o cliente
 * interpretar. Os erros continuam a sair em JSON: um ficheiro com uma
 * mensagem de erro lá dentro seria pior do que um erro.
 *
 * Só administradores: a listagem inclui nomes e emails de toda a gente, e um
 * distribuidor não tem de os poder descarregar em bloco.
 */
export async function GET(request: NextRequest) {
  try {
    await requireApiAdmin();

    const empresa = request.nextUrl.searchParams.get("empresa") ?? undefined;
    if (empresa && !/^[0-9a-f-]{36}$/i.test(empresa)) {
      throw new AppError("VALIDATION_ERROR", {
        details: ["O identificador da empresa não é válido."],
      });
    }

    const pessoas = await listDeliveredPeople(empresa);

    const csv = entregasParaCsv(pessoas, formatDateTime);

    // O nome inclui a data para que dois ficheiros do mesmo evento não se
    // sobreponham na pasta de transferências.
    const hoje = new Date().toISOString().slice(0, 10);
    const nome = `entregas-${hoje}.csv`;

    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${nome}"`,
        // Um ficheiro exportado é uma fotografia do momento: nunca deve vir
        // de uma cache, nem do browser nem de um intermediário.
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
