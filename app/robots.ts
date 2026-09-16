import type { MetadataRoute } from "next";

/**
 * robots.txt
 *
 * Deliberadamente SEM `Disallow: /`.
 *
 * Parece contraintuitivo, mas é o contrário que funciona: o robots.txt
 * controla o RASTREIO, não a indexação. Com `Disallow: /`, o motor de busca
 * nunca chega a buscar as páginas e por isso nunca vê a diretiva `noindex` —
 * e um URL descoberto a partir de uma ligação externa pode acabar listado nos
 * resultados, sem conteúdo, mesmo assim.
 *
 * Permitindo o rastreio, o `noindex` é lido — na meta tag e no cabeçalho
 * X-Robots-Tag — e as páginas ficam efetivamente fora dos resultados.
 *
 * De qualquer forma, tudo o que não seja o ecrã de login exige sessão: um
 * rastreador só encontra o formulário de início de sessão.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
  };
}
