import { ok } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/** Verificação de saúde. Não expõe configuração nem segredos. */
export function GET() {
  return ok({ status: "ok", timestamp: new Date().toISOString() });
}
