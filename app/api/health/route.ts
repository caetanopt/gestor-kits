import { ok } from "@/lib/api/response";
import { canCreateUsers } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Verificação de saúde.
 *
 * Inclui o identificador do projeto Supabase contra o qual a aplicação está
 * configurada. Não é um segredo — o NEXT_PUBLIC_SUPABASE_URL já viaja no
 * bundle que o browser recebe — e é a forma mais rápida de detetar o erro
 * clássico de configuração: a aplicação a apontar para um projeto diferente
 * daquele que se está a consultar no painel. Nesse caso o login falha sempre,
 * com a base de dados aparentemente impecável.
 *
 * A chave anon é reportada apenas como presente/ausente e pelo comprimento,
 * o suficiente para detetar uma cópia truncada sem a revelar.
 */
export function GET() {
  const urlRaw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

  let url: URL | null = null;
  try {
    url = new URL(urlRaw.trim());
  } catch {
    url = null;
  }

  // Estes dois casos produzem exatamente o mesmo sintoma — 404 "Invalid path
  // specified in request URL" do gateway do Supabase — e são invisíveis a
  // olho nu no painel do Vercel. A aplicação corrige a barra final sozinha;
  // o caminho a mais tem de ser corrigido na configuração.
  const temBarraFinal = urlRaw.trim().endsWith("/");
  const temCaminho = url !== null && url.pathname !== "/";

  const problemas: string[] = [];
  if (urlRaw === "") problemas.push("NEXT_PUBLIC_SUPABASE_URL não está definida.");
  else if (url === null) problemas.push("NEXT_PUBLIC_SUPABASE_URL não é um URL válido.");
  else if (url.protocol !== "https:")
    problemas.push("NEXT_PUBLIC_SUPABASE_URL não usa https.");
  // Caminho e barra final são corrigidos pela aplicação (ver lib/env.ts), por
  // isso são avisos e não problemas: a aplicação funciona à mesma.
  const avisos: string[] = [];
  if (temCaminho)
    avisos.push(
      `NEXT_PUBLIC_SUPABASE_URL inclui o caminho "${url?.pathname}", que é ignorado. Convém removê-lo.`,
    );
  if (temBarraFinal)
    avisos.push("NEXT_PUBLIC_SUPABASE_URL termina em barra, que é ignorada.");
  if (anonKey === "") problemas.push("NEXT_PUBLIC_SUPABASE_ANON_KEY não está definida.");

  return ok({
    status: problemas.length === 0 ? "ok" : "configuracao_invalida",
    timestamp: new Date().toISOString(),
    supabase: {
      projectRef: url?.hostname.split(".")[0] ?? null,
      origem: url?.origin ?? null,
      temBarraFinal,
      temCaminho,
      anonKeyConfigurada: anonKey !== "",
      anonKeyComprimento: anonKey.length,
    },
    problemas,
    avisos,
    // Dois sinalizadores operacionais que enfraquecem a segurança e são
    // invisíveis no painel de quem só olha para a aplicação. Expostos aqui
    // para que se possa confirmar que ficaram desligados.
    autenticacaoDesativada: Boolean(
      process.env.AUTH_BYPASS_EMAIL && process.env.AUTH_BYPASS_PASSWORD,
    ),
    diagnosticoDeLoginAtivo: process.env.LOGIN_DIAGNOSTICS === "1",
    // Se o botão "Nova conta" aparece na página Utilizadores. Depende de
    // SUPABASE_SERVICE_ROLE_KEY estar definida no ambiente onde a aplicação
    // corre — e definir uma variável no painel só tem efeito depois de novo
    // deploy, que é onde isto normalmente falha. Booleano: a chave não sai
    // daqui.
    criacaoDeContasDisponivel: canCreateUsers(),
  });
}
