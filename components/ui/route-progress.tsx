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
      {/* Azul profundo e não cyan: a barra diz alguma coisa, portanto vale-lhe
          o mínimo de 3:1 para elementos não textuais, e o cyan sobre branco
          fica em 2,53:1 (ver tests/unit/contraste.test.ts). O brilho cyan é
          só halo — não transporta significado nenhum, e por isso pode ser
          ele a dar o movimento que a cor da marca não dá. */}
      <div
        className="bg-azul-900 h-full w-full origin-left shadow-[0_1px_5px_rgba(0,174,239,0.45)]"
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

function SinalDeNavegacao() {
  const { pending } = useLinkStatus();

  useEffect(() => {
    if (!pending) return;
    return abrirNavegacao();
  }, [pending]);

  return null;
}
