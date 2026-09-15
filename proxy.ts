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

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
     * Tudo exceto ficheiros estáticos e o endpoint de saúde.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
