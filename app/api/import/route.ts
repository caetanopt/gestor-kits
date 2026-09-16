import type { NextRequest } from "next/server";
import { ok, toErrorResponse } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiAdmin } from "@/lib/auth/dal";
import { MAX_IMPORT_BYTES, readImportFile } from "@/lib/import/read-file";
import { importEmployees } from "@/server/use-cases/import-employees";

/**
 * POST /api/import
 *
 * multipart/form-data com:
 *   file   — ficheiro CSV ou XLSX
 *   commit — "true" para importar; qualquer outro valor devolve apenas o
 *            relatório, sem escrever nada
 */
export async function POST(request: NextRequest) {
  try {
    await requireApiAdmin();

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");

    if (!(file instanceof File) || file.size === 0) {
      throw new AppError("INVALID_FILE", {
        details: ["Selecione um ficheiro CSV ou Excel."],
      });
    }
    if (file.size > MAX_IMPORT_BYTES) {
      throw new AppError("INVALID_FILE", {
        details: [
          `O ficheiro excede o limite de ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB.`,
        ],
      });
    }

    let rows: string[][];
    try {
      rows = await readImportFile(file);
    } catch (error) {
      console.error("[import] falha a ler o ficheiro", error);
      throw new AppError("INVALID_FILE", {
        details: ["Não foi possível ler o ficheiro. Verifique o formato."],
      });
    }

    const commit = form?.get("commit") === "true";
    return ok(await importEmployees({ rows, commit }));
  } catch (error) {
    return toErrorResponse(error);
  }
}
