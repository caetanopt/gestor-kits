import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

/**
 * Montserrat — tipografia secundária da marca (Brand Book 03.1).
 *
 * Os pesos correspondem aos do manual: Light 300, Regular 400, Medium 500
 * (usado no claim) e Bold 700.
 *
 * Servida a partir do próprio domínio por `next/font`, sem pedidos a
 * servidores externos, o que também evita o salto de layout ao carregar.
 */
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Distribuição de Kits · Caetano",
  description: "Gestão da distribuição de kits durante um evento.",
  // Aplicação interna com dados de colaboradores: não deve aparecer em
  // motores de busca. Reforçado pelo cabeçalho X-Robots-Tag em
  // next.config.ts, que também cobre respostas que não são HTML.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#000E2C",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-PT" className={montserrat.variable}>
      <body>{children}</body>
    </html>
  );
}
