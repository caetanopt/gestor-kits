import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Proxy (antes chamado middleware).
 *
 * Duas responsabilidades, ambas deliberadamente superficiais:
 *
 *  1. Renovar a sessão do Supabase e propagar os cookies atualizados.
 *  2. Redirecionar visitantes sem sessão para o login — uma verificação
 *     otimista, para evitar renderizar páginas que vão falhar de qualquer
 *     forma.
 *
 * A autorização a sério vive em `lib/auth/dal.ts` e nas políticas RLS. O
 * proxy nunca é a única barreira: a documentação do Next.js desaconselha
 * explicitamente usá-lo como solução de autorização.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sem configuração não há sessão a renovar; deixa a página tratar do erro.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  let {
    data: { user },
  } = await supabase.auth.getUser();

  // Modo de autenticação desativada (ver lib/auth/bypass.ts). Entra
  // automaticamente com a conta configurada em vez de mostrar o login.
  //
  // É feito aqui, no proxy, porque é o único sítio do pedido onde se podem
  // escrever os cookies da sessão: um Server Component não os consegue
  // definir.
  const bypassEmail = process.env.AUTH_BYPASS_EMAIL?.trim();
  const bypassPassword = process.env.AUTH_BYPASS_PASSWORD;

  if (!user && bypassEmail && bypassPassword) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: bypassEmail,
      password: bypassPassword,
    });

    if (error) {
      console.error("[proxy] autenticação automática falhou", {
        email: bypassEmail,
        code: error.code,
        reason: error.message,
      });
    } else {
      console.warn(
        "[proxy] AUTENTICAÇÃO DESATIVADA — sessão automática iniciada como",
        bypassEmail,
      );
      user = data.user;
    }
  }

  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/login";

  if (!user && !isLogin) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.searchParams.set("seguinte", pathname);
    return NextResponse.redirect(target);
  }

  if (user && isLogin) {
    const target = request.nextUrl.clone();
    target.pathname = "/";
    target.search = "";
    return NextResponse.redirect(target);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Tudo exceto ficheiros estáticos, as rotas de API e os ficheiros que os
     * rastreadores e o browser vão buscar à raiz.
     *
     * As rotas de API ficam de fora porque aqui não tênhamos nada a fazer por
     * elas: nunca são redirecionadas (um redirecionamento devolveria HTML a
     * quem espera JSON) e cada route handler valida a sessão por si, com um
     * getUser() que também a renova e grava os cookies atualizados na
     * resposta. Mantê-las aqui custava uma ida ao Supabase por pedido — em
     * cada tecla escrita na pesquisa — para repetir o que o handler faz a
     * seguir.
     *
     * O robots.txt tem de ficar de fora: redirecionado para o login, um
     * rastreador receberia HTML em vez das diretivas, e a aplicação ficaria
     * sem a instrução de não indexar que é suposto dar.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
