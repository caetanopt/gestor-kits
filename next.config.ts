import type { NextConfig } from "next";

/**
 * Cabeçalhos de segurança.
 *
 * Conservadores de propósito: cobrem o que é barato e sem risco de partir a
 * aplicação. Não há aqui uma Content-Security-Policy completa para scripts —
 * essa exigiria nonces e testes dedicados, e uma CSP mal configurada que
 * parte a página a meio de um evento é pior do que não a ter.
 *
 * O `frame-ancestors` é a exceção: é uma diretiva de CSP que não afeta o
 * carregamento de scripts e substitui o X-Frame-Options, que está obsoleto.
 */
const securityHeaders = [
  // A aplicação nunca deve ser embebida noutra página: mostra dados de
  // colaboradores e tem ações destrutivas atrás de um clique.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nenhuma destas capacidades é usada.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
