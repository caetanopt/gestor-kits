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

  // As rotas de API nunca são redirecionadas: um redirecionamento devolveria
  // HTML a quem espera JSON. O route handler trata do caso sem sessão com
  // requireApiUser(), que produz um 401 com o envelope de erro normal.
  const isApi = pathname.startsWith("/api/");

  if (!user && !isLogin && !isApi) {
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
     * Tudo exceto ficheiros estáticos e o endpoint de saúde.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
