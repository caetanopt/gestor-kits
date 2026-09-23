"use client";

import Link, { useLinkStatus } from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  abrirNavegacao,
  haNavegacaoPendente,
  subscreverNavegacao,
} from "@/lib/ui/navegacao-pendente";
import type { ComponentProps } from "react";

/** Quanto tempo uma navegação tem de demorar antes de valer a pena mostrá-la. */
const ATRASO_ATE_APARECER = 150;
/** Tempo entre passos do avanço, igual à transição CSS. */
const PASSO = 240;
/** Tempo que a barra demora a completar e desaparecer. */
const SAIDA = 260;
/** Onde o avanço trava. Nunca chega ao fim sozinho: o fim é a página chegar. */
const TETO = 0.9;

type Fase = "parada" | "a-avancar" | "a-terminar";

function prefereSemMovimento(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * Barra de progresso da navegação entre páginas.
 *
 * As páginas são Server Components: entre o clique e a página nova há uma ida
 * ao servidor em que o ecrã antigo continua no sítio, sem nada a dizer que
 * alguma coisa está a acontecer. Esta linha preenche esse silêncio.
 *
 * O avanço aproxima-se de 90% sem lá chegar, porque não sabemos quanto falta:
 * fingir uma percentagem real seria mentir. Os 100% são a chegada da página.
 *
 * Só aparece se a navegação passar dos 150 ms. As instantâneas — que são a
 * maioria, com o prefetch do Next — não devem produzir um piscar no topo do
 * ecrã a cada clique.
 */
export function RouteProgress() {
  const pendente = useSyncExternalStore(
    subscreverNavegacao,
    haNavegacaoPendente,
    () => false,
  );

  const [fase, setFase] = useState<Fase>("parada");
  const [progresso, setProgresso] = useState(0);
  const chegouAAparecer = useRef(false);

  // Entrada e saída.
  useEffect(() => {
    if (pendente) {
      const temporizador = setTimeout(() => {
        chegouAAparecer.current = true;
        // Sem movimento, a barra entra já no sítio onde vai ficar.
        setProgresso(prefereSemMovimento() ? 0.35 : 0.08);
        setFase("a-avancar");
      }, ATRASO_ATE_APARECER);
      return () => clearTimeout(temporizador);
    }

    // Navegação terminada antes de a barra aparecer: não há nada a fechar.
    if (!chegouAAparecer.current) return;
    chegouAAparecer.current = false;

    setProgresso(1);
    setFase("a-terminar");
    const temporizador = setTimeout(() => setFase("parada"), SAIDA);
    return () => clearTimeout(temporizador);
  }, [pendente]);

  // Avanço.
  useEffect(() => {
    if (fase !== "a-avancar") return;

    // Sem movimento: uma barra parada continua a dizer que algo está a
    // acontecer, sem perseguir os olhos de quem pediu para não o fazer.
    if (prefereSemMovimento()) return;

    const intervalo = setInterval(() => {
      // Cada passo cobre parte do que falta para o teto, portanto abranda
      // sozinho à medida que se aproxima.
      setProgresso((actual) => actual + (TETO - actual) * 0.18);
    }, PASSO);
    return () => clearInterval(intervalo);
  }, [fase]);

  if (fase === "parada") return null;

  return (
    // aria-hidden: o Next já anuncia a mudança de página a quem usa leitor de
    // ecrã. Uma segunda voz a dizer o mesmo seria ruído.
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px]"
    >
      {/* Dourado do evento: a barra passa por cima do fundo azul-escuro, onde
          o azul profundo de antes desaparecia. Sobre esse fundo o dourado dá
          13,6:1, bem acima dos 3:1 pedidos a elementos não textuais (ver
          tests/unit/contraste.test.ts). */}
      <div
        className="bg-dourado-300 h-full w-full origin-left shadow-[0_1px_5px_rgba(255,212,131,0.45)]"
        style={{
          transform: `scaleX(${progresso})`,
          opacity: fase === "a-terminar" ? 0 : 1,
          transition:
            fase === "a-terminar"
              ? `transform 200ms ease-out, opacity 200ms ease-in 60ms`
              : `transform ${PASSO}ms linear`,
        }}
      />
    </div>
  );
}

/**
 * Ligação que alimenta a barra.
 *
 * `useLinkStatus` é o primitivo do Next para isto, e tem uma propriedade que
 * a alternativa óbvia — ouvir cliques no documento — não tem: quem detém o
 * estado é o React. Uma navegação cancelada ou substituída limpa-se sozinha,
 * e a barra não pode ficar presa no topo do ecrã.
 */
export function ProgressLink(props: ComponentProps<typeof Link>) {
  const { children, ...resto } = props;
  return (
    <Link {...resto}>
      <SinalDeNavegacao />
      {children}
    </Link>
  );
}

/**
 * Marca a ligação como em navegação, de duas maneiras.
 *
 * Alimenta a barra do topo, e deixa no DOM um elemento vazio que a própria
 * ligação pode observar com `has-[[data-navegacao-pendente]]:` para se manter
 * realçada até a página chegar.
 *
 * O realce vai por aqui e não por uma classe passada de fora porque
 * `useLinkStatus` só funciona dentro do Link, e o elemento a pintar é o
 * próprio Link — o pai. É o `:has()` que resolve essa inversão sem embrulhar
 * o conteúdo num elemento que estragaria a disposição de quem usa flex.
 */
function SinalDeNavegacao() {
  const { pending } = useLinkStatus();

  useEffect(() => {
    if (!pending) return;
    return abrirNavegacao();
  }, [pending]);

  if (!pending) return null;
  return <span hidden data-navegacao-pendente />;
}
