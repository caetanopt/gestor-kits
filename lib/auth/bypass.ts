import "server-only";

/**
 * Modo de autenticação desativada — APENAS para desenvolvimento e demonstração.
 *
 * ## Porque é que isto não é simplesmente "esconder o ecrã de login"
 *
 * A segurança desta aplicação vive na base de dados, não na interface. Todas
 * as funções SQL começam por verificar `auth.uid()` e recusam-se a executar
 * sem sessão, e o RLS filtra todas as leituras. Esconder o ecrã de login não
 * daria uma aplicação sem autenticação — daria uma aplicação avariada.
 *
 * Por isso, "desativar a autenticação" significa aqui entrar automaticamente
 * com uma conta fixa. A sessão continua a ser real e a base de dados continua
 * a aplicar todas as regras; o que desaparece é o passo de escrever as
 * credenciais.
 *
 * ## Consequência
 *
 * Enquanto estiver ativo, QUALQUER PESSOA que conheça o URL entra com as
 * permissões dessa conta — incluindo ver os dados dos colaboradores, entregar
 * kits e, se a conta for administrador, anular entregas e apagar dados.
 *
 * Não usar em produção com dados reais.
 *
 * ## Como ligar e desligar
 *
 * Ligar:   definir AUTH_BYPASS_EMAIL e AUTH_BYPASS_PASSWORD.
 * Desligar: apagar essas duas variáveis e voltar a fazer deploy.
 *
 * Quando está ativo, a aplicação mostra um aviso permanente no topo de todas
 * as páginas, para que nunca fique ligado por esquecimento.
 */
export type AuthBypass = { email: string; password: string };

export function authBypass(): AuthBypass | null {
  const email = process.env.AUTH_BYPASS_EMAIL?.trim();
  const password = process.env.AUTH_BYPASS_PASSWORD;

  if (!email || !password) return null;

  return { email, password };
}

export function isAuthBypassEnabled(): boolean {
  return authBypass() !== null;
}
