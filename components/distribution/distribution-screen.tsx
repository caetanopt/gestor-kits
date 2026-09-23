"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  correspondenciaUnicaPorEmail,
  deveSugerir,
  pareceEmail,
} from "@/lib/validation/delivery";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { TotalsPanel } from "./totals-panel";
import { StatusBadge } from "./status-badge";
import { formatDateTime } from "@/lib/format/date";
import type {
  DeliveryResult,
  EmployeeLookup,
  EmployeeMatch,
  EmployeeSearch,
} from "@/lib/validation/delivery";

type Screen =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "aguarda" }
  | { kind: "matches"; search: EmployeeSearch }
  | { kind: "found"; lookup: EmployeeLookup; idempotencyKey: string }
  | { kind: "delivered"; result: DeliveryResult }
  // Ninguém com este número ou nome. Guarda o que foi escrito para o
  // formulário já vir preenchido — quem chegou aqui acabou de o escrever.
  | { kind: "ausente"; employeeNumber: string; name: string; email: string }
  | { kind: "error"; message: string };

/**
 * Modo de pesquisa.
 *
 * O número é o predefinido: é o fluxo rápido do evento. O nome ou email
 * existe para quem chega sem saber o número, e devolve uma lista em vez de
 * um resultado único.
 */
type Mode = "numero" | "nome";

/**
 * Abre o formulário com o termo no campo certo.
 *
 * Um email escrito na barra de pesquisa pertence ao campo Email; tudo o resto
 * é nome. Pôr um email no campo Nome criava uma pessoa chamada
 * "ana@empresa.pt" e sem email nenhum — e a pesquisa seguinte pelo mesmo
 * email não a encontrava.
 */
function estadoAusente(termo: string): Screen {
  const limpo = termo.trim();
  return pareceEmail(limpo)
    ? { kind: "ausente", employeeNumber: "", name: "", email: limpo }
    : { kind: "ausente", employeeNumber: "", name: limpo, email: "" };
}

/** Empresa a que o colaborador novo pode ser associado. */
export type CompanyOption = { id: string; name: string };

type ApiEnvelope<T> =
  { success: true; data: T } | { success: false; code: string; message: string };

async function callApi<T>(input: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    return {
      success: false,
      code: "NETWORK_ERROR",
      message: "Sem ligação ao servidor. Verifique a rede e tente novamente.",
    };
  }

  try {
    return (await response.json()) as ApiEnvelope<T>;
  } catch {
    // Chegou algo que não é o nosso envelope JSON — tipicamente uma página de
    // erro do servidor. Não o confundir com falta de rede.
    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        code: "UNAUTHENTICATED",
        message: "A sessão expirou. Volte a iniciar sessão.",
      };
    }
    return {
      success: false,
      code: "INTERNAL_ERROR",
      message: `O servidor respondeu de forma inesperada (${response.status}).`,
    };
  }
}

/**
 * Ecrã de distribuição.
 *
 * ## Modelo de interação
 *
 * O foco fica SEMPRE no campo de pesquisa. Isto é deliberado e é a principal
 * defesa contra entregas acidentais.
 *
 * A especificação sugere "Enter confirma a entrega quando o cartão está
 * ativo" (secção 27). Implementado à letra, isso é perigoso: os leitores de
 * código de barras enviam os dígitos seguidos de Enter. Se o foco estivesse
 * no botão ENTREGAR KIT, ler o crachá da pessoa seguinte descartaria os
 * dígitos e o Enter final entregaria um kit à pessoa errada.
 *
 * Por isso o Enter tem dois significados, distinguidos pelo conteúdo do
 * campo:
 *
 *   - campo com texto  → pesquisa (é o que um leitor de códigos produz)
 *   - campo vazio      → entrega o kit do cartão visível
 *
 * O campo é limpo depois de cada pesquisa, portanto o fluxo rápido continua
 * a ser  `número → Enter → Enter`, mas uma leitura inesperada nunca entrega
 * um kit: preenche o campo e faz uma pesquisa nova.
 */
export function DistributionScreen({ companies }: { companies: CompanyOption[] }) {
  const [screen, setScreen] = useState<Screen>({ kind: "idle" });
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("numero");
  const inputRef = useRef<HTMLInputElement>(null);
  // Guarda o texto atual para descartar respostas que cheguem fora de ordem.
  // Escrever numa ref durante a renderização é uma violação do React, daí o
  // efeito.
  const queryRef = useRef("");
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const focusSearch = useCallback(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const searchByNumber = useCallback(
    async (rawNumber: string) => {
      const employeeNumber = rawNumber.trim();
      if (!employeeNumber) return;

      setScreen({ kind: "busy", label: "A pesquisar…" });
      setQuery("");

      const result = await callApi<EmployeeLookup>(
        `/api/employees/${encodeURIComponent(employeeNumber)}`,
      );

      if (!result.success) {
        // Não é um erro, é um caso de trabalho: a pessoa está à frente do
        // balcão e não está na lista.
        if (result.code === "EMPLOYEE_NOT_FOUND") {
          setScreen({ kind: "ausente", employeeNumber, name: "", email: "" });
        } else {
          setScreen({ kind: "error", message: result.message });
        }
      } else {
        setScreen({
          kind: "found",
          lookup: result.data,
          // Uma chave nova por pesquisa: identifica esta intenção de entrega.
          // Reenviar a mesma chave é inofensivo e devolve o mesmo resultado.
          idempotencyKey: crypto.randomUUID(),
        });
      }

      focusSearch();
    },
    [focusSearch],
  );

  /** Carrega o cartão de um resultado da lista, como se tivesse sido pesquisado. */
  const openMatch = useCallback(
    (match: EmployeeMatch) => {
      // O campo fica vazio de propósito: o Enter seguinte entrega o kit, tal
      // como depois de uma pesquisa por número.
      setQuery("");
      queryRef.current = "";
      void searchByNumber(match.employeeNumber);
    },
    [searchByNumber],
  );

  /**
   * Pesquisa por nome ou email.
   *
   * `silencioso` distingue as sugestões que aparecem enquanto se escreve, que
   * não devem mostrar "a pesquisar" nem erros a cada tecla, de uma pesquisa
   * pedida explicitamente com Enter ou pelo botão.
   */
  const searchByName = useCallback(
    async (rawTerm: string, silencioso = false) => {
      if (!rawTerm.trim()) {
        if (!silencioso) setScreen({ kind: "idle" });
        return;
      }

      if (!deveSugerir(rawTerm)) {
        // Ainda não há nome próprio completo nem email inteiro: não vale a
        // pena perguntar ao servidor, que responderia vazio.
        setScreen({ kind: "aguarda" });
        return;
      }

      if (!silencioso) setScreen({ kind: "busy", label: "A pesquisar…" });

      // O termo vai POR APARAR, de propósito. A regra do primeiro espaço vive
      // em `public.search_employees_for_delivery` e distingue "Miguel " de
      // "Miguel"; aparar aqui apagava essa diferença e o servidor respondia
      // sempre "ainda falta escrever". É o SQL que apara para pesquisar.
      const result = await callApi<EmployeeSearch>(
        `/api/employees/search?q=${encodeURIComponent(rawTerm)}`,
      );

      // O texto mudou entretanto: esta resposta já não é a que interessa.
      // Comparação exata, pela mesma razão: o espaço final faz parte do termo.
      if (queryRef.current !== rawTerm) return;

      if (!result.success) {
        setScreen({ kind: "error", message: result.message });
        return;
      }
      if (result.data.aguarda) {
        setScreen({ kind: "aguarda" });
        return;
      }
      if (result.data.results.length === 0) {
        setScreen(estadoAusente(rawTerm));
        return;
      }

      // Um email exato identifica uma pessoa: uma lista de um elemento só
      // acrescentaria um clique. Abre o cartão como se fosse um número.
      const porEmail = correspondenciaUnicaPorEmail(result.data);
      if (porEmail) {
        openMatch(porEmail);
        return;
      }

      setScreen({ kind: "matches", search: result.data });
    },
    [openMatch],
  );

  const deliver = useCallback(
    async (lookup: EmployeeLookup, idempotencyKey: string) => {
      setScreen({ kind: "busy", label: "A entregar…" });

      const result = await callApi<DeliveryResult>("/api/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeNumber: lookup.employee.employeeNumber,
          idempotencyKey,
        }),
      });

      if (!result.success) {
        setScreen({ kind: "error", message: result.message });
      } else {
        setScreen({ kind: "delivered", result: result.data });
      }

      // Campo limpo e focado imediatamente: o operador pode começar a
      // escrever o número seguinte enquanto lê a confirmação (secção 26).
      setQuery("");
      focusSearch();
    },
    [focusSearch],
  );

  /**
   * Acrescenta o colaborador e abre-lhe o cartão.
   *
   * O ecrã segue direto para "found": a resposta traz o mesmo payload da
   * pesquisa, e quem acabou de escrever o nome quer entregar o kit a seguir,
   * não voltar ao princípio.
   */
  const criarColaborador = useCallback(
    async (input: {
      employeeNumber: string;
      name: string;
      email: string;
      companyId: string;
    }) => {
      setScreen({ kind: "busy", label: "A acrescentar…" });

      const result = await callApi<EmployeeLookup>("/api/employees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!result.success) {
        setScreen({ kind: "error", message: result.message });
      } else {
        setScreen({
          kind: "found",
          lookup: result.data,
          idempotencyKey: crypto.randomUUID(),
        });
      }

      setQuery("");
      focusSearch();
    },
    [focusSearch],
  );

  /**
   * Anula a entrega visível e reabre o cartão.
   *
   * A seguir à anulação pesquisa-se o mesmo número outra vez, em vez de se
   * corrigir o cartão em memória: o estado que interessa é o do servidor, e
   * quem anulou por engano quer ver, preto no branco, que o kit voltou a
   * estar por entregar.
   */
  const anularEntrega = useCallback(
    async (lookup: EmployeeLookup, deliveryId: string) => {
      setScreen({ kind: "busy", label: "A anular…" });

      const result = await callApi<unknown>(`/api/deliveries/${deliveryId}/reverse`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Anulada no balcão" }),
      });

      if (!result.success) {
        setScreen({ kind: "error", message: result.message });
        focusSearch();
        return;
      }

      await searchByNumber(lookup.employee.employeeNumber);
    },
    [focusSearch, searchByNumber],
  );

  const reset = useCallback(() => {
    setScreen({ kind: "idle" });
    setQuery("");
    focusSearch();
  }, [focusSearch]);

  const changeMode = useCallback(
    (next: Mode) => {
      setMode(next);
      setScreen({ kind: "idle" });
      setQuery("");
      focusSearch();
    },
    [focusSearch],
  );

  useEffect(() => {
    focusSearch();
  }, [focusSearch]);

  /**
   * Devolve o foco ao campo sempre que um cartão aparece.
   *
   * As funções de pesquisa já pedem o foco, mas fazem-no antes de o React
   * voltar a renderizar, e o clique num resultado tira-o do campo. Sem isto, o
   * foco ficava por vezes no botão que acabou de desaparecer e o Enter
   * seguinte não entregava nada.
   */
  useEffect(() => {
    if (screen.kind === "found" || screen.kind === "delivered") focusSearch();
  }, [screen.kind, focusSearch]);

  /**
   * Sugestões enquanto se escreve.
   *
   * O atraso evita um pedido por tecla; combinado com a regra do primeiro
   * espaço, a maioria das teclas nem chega a provocar um pedido.
   *
   * Eram 250 ms quando cada pesquisa custava quatro idas ao Supabase. Agora
   * que custa duas, o atraso pesa mais na espera do que o pedido em si, e
   * 120 ms continuam a apanhar a escrita normal sem a perseguir.
   */
  useEffect(() => {
    if (mode !== "nome") return;

    const termo = query;
    const temporizador = setTimeout(() => {
      void searchByName(termo, true);
    }, 120);

    return () => clearTimeout(temporizador);
  }, [query, mode, searchByName]);

  // Só uma condição: não ter recebido ainda. Não há limite por empresa que
  // possa recusar a entrega.
  const canDeliver = screen.kind === "found" && screen.lookup.delivery === null;

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      reset();
      return;
    }

    if (event.key !== "Enter") return;
    event.preventDefault();

    if (query.trim()) {
      if (mode === "numero") void searchByNumber(query);
      else void searchByName(query);
    } else if (canDeliver && screen.kind === "found") {
      void deliver(screen.lookup, screen.idempotencyKey);
    }
  }

  const busy = screen.kind === "busy";

  /**
   * Há alguma coisa no ecrã a competir com o cartão de pesquisa?
   *
   * Quando há, o cartão encolhe: o campo perde altura e os botões e a dica de
   * teclado saem. Não se perde nada — o Enter e o Esc continuam a funcionar,
   * e a dica só é útil a quem ainda não começou. O que se ganha são 116px
   * dos 312 do cartão, que é o que põe o nome do colaborador e o botão de
   * entrega dentro da dobra de um tablet.
   */
  const compacto =
    screen.kind === "found" ||
    screen.kind === "delivered" ||
    screen.kind === "matches" ||
    screen.kind === "ausente";

  return (
    // Uma coluna centrada, com a mesma largura em todos os ecrãs.
    //
    // Chegou a haver duas colunas em ecrã largo, para o resultado não cair
    // abaixo da dobra. Custava o principal: com o cartão encostado à
    // esquerda e metade do ecrã vazia à espera de um resultado, o operador
    // não tinha para onde olhar. O cartão encolhe assim que há resultado
    // (`compacto`), e é isso que mantém a entrega dentro da dobra numa só
    // coluna.
    <div className="mx-auto w-full max-w-[800px] space-y-6">
      {/* Pesquisa ------------------------------------------------------- */}
      <div className="ring-dourado-200 rounded bg-white p-5 ring-1 sm:p-6">
        {/* Separadores. O modo por número fica primeiro por ser o fluxo
            rápido do evento. */}
        <div
          role="tablist"
          aria-label="Modo de pesquisa"
          className="border-dourado-100 mb-4 flex border-b"
        >
          {(
            [
              ["numero", "N.º colaborador"],
              ["nome", "Nome ou email"],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={mode === valor}
              onClick={() => changeMode(valor)}
              // Separador sublinhado, como no convite. O ativo distingue-se
              // pelo traço, pelo peso e pela cor — não só pela cor.
              className={`active:bg-dourado-50 -mb-px flex-1 touch-manipulation border-b-2 px-4 py-2.5 text-sm transition duration-100 select-none ${
                mode === valor
                  ? "text-azul-900 border-dourado-600 font-bold"
                  : "text-ink-700 hover:text-ink-900 border-transparent font-semibold"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <label
          htmlFor="employee-number"
          className="text-ink-700 block text-center text-sm font-medium"
        >
          {mode === "numero" ? "Número de colaborador" : "Nome ou email"}
        </label>

        <input
          ref={inputRef}
          id="employee-number"
          name="employee-number"
          type="text"
          inputMode={mode === "numero" ? "numeric" : "text"}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          value={query}
          disabled={busy}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Mantém o cursor no campo: num tablet, tocar fora não deve
            // obrigar o operador a voltar a tocar no campo.
            //
            // Exceto quando há um formulário aberto — o de "não está na
            // lista" tem campos próprios, e roubar-lhes o foco tornava-os
            // impossíveis de preencher: cada tecla ia parar à pesquisa.
            //
            // Aqui é focus() e não focusSearch(): devolver o foco não pode
            // selecionar o que já está escrito. Nos outros pontos de chamada o
            // campo está vazio e a seleção é indiferente; neste pode ter texto
            // a meio, e selecioná-lo faria a tecla seguinte apagá-lo.
            if (!busy && screen.kind !== "ausente") {
              requestAnimationFrame(() => inputRef.current?.focus());
            }
          }}
          // Campo creme com filete dourado, como no convite. O foco fica com
          // o contorno ciano de todos os campos da aplicação (globals.css),
          // sem um segundo anel a desenhar uma borda dupla.
          className={`bg-dourado-50 text-ink-900 ring-dourado-200 font-display mt-3 w-full rounded px-4 text-center font-medium ring-1 disabled:opacity-60 ${
            compacto ? "py-2" : "py-5"
          } ${mode === "numero" ? "text-4xl tracking-[0.1em] tabular-nums" : "text-2xl"}`}
          placeholder={mode === "numero" ? "—" : "Nome completo ou email"}
        />

        {/* Os botões ficam sempre, só encolhem: num tablet não há tecla Esc, e
            sem o "Limpar" o operador ficaria sem forma nenhuma de abandonar
            um cartão. A dica de teclado, essa, sai — só serve a quem ainda
            não começou, e nessa altura o cartão está vazio. */}
        <div className="mt-3 flex items-center justify-center gap-3">
          <Button
            type="button"
            size={compacto ? "md" : "lg"}
            variant="contorno"
            disabled={busy || !query.trim()}
            onClick={() => {
              if (mode === "numero") void searchByNumber(query);
              else void searchByName(query);
            }}
          >
            Pesquisar
          </Button>
          <Button
            type="button"
            size={compacto ? "md" : "lg"}
            variant="ghost"
            onClick={reset}
            disabled={busy}
          >
            Limpar
          </Button>
        </div>

        {!compacto && (
          <p className="text-ink-700 mt-3 text-center text-xs">
            <kbd className="bg-ink-100 rounded px-1.5 py-0.5 font-sans">Enter</kbd>{" "}
            pesquisa ·{" "}
            <kbd className="bg-ink-100 rounded px-1.5 py-0.5 font-sans">Esc</kbd> limpa
          </p>
        )}
      </div>

      {/* Resultado ------------------------------------------------------- */}
      <div aria-live="polite" aria-atomic="true" className="space-y-6">
        {screen.kind === "busy" && (
          <p className="text-ink-700 text-center text-sm">{screen.label}</p>
        )}

        {screen.kind === "error" && <Alert tone="error">{screen.message}</Alert>}

        {screen.kind === "aguarda" && (
          <div className="space-y-3 text-center">
            <p className="text-ink-700 text-sm">
              Escreva o nome próprio seguido de um espaço para ver sugestões, ou o email
              completo.
            </p>
            {/* Sem isto, quem escreve um nome de uma só palavra fica sem saída
                nenhuma: não há sugestões e não há como acrescentar. */}
            {query.trim() !== "" && (
              <Button
                type="button"
                variant="contorno"
                onClick={() => setScreen(estadoAusente(query))}
              >
                Não está na lista? Acrescentar
              </Button>
            )}
          </div>
        )}

        {screen.kind === "matches" && (
          <MatchList
            search={screen.search}
            onOpen={openMatch}
            onAusente={() => setScreen(estadoAusente(query))}
          />
        )}

        {screen.kind === "found" && (
          <FoundCard
            key={screen.lookup.employee.id}
            lookup={screen.lookup}
            canDeliver={canDeliver}
            onDeliver={() => void deliver(screen.lookup, screen.idempotencyKey)}
            onAnular={(deliveryId) => void anularEntrega(screen.lookup, deliveryId)}
          />
        )}

        {screen.kind === "ausente" && (
          <AusenteCard
            key={`${screen.employeeNumber}|${screen.name}|${screen.email}`}
            employeeNumber={screen.employeeNumber}
            name={screen.name}
            email={screen.email}
            companies={companies}
            onCancel={reset}
            onCreate={criarColaborador}
          />
        )}

        {screen.kind === "delivered" && <DeliveredCard result={screen.result} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

/**
 * Resultados da pesquisa por nome ou email.
 *
 * Mostra apenas o necessário para identificar a pessoa: nome, número e
 * empresa. O email só aparece quando foi ele que correspondeu — quem
 * pesquisou por nome não precisa de ver as moradas de toda a gente.
 */
function MatchList({
  search,
  onOpen,
  onAusente,
}: {
  search: EmployeeSearch;
  onOpen: (match: EmployeeMatch) => void;
  onAusente: () => void;
}) {
  return (
    <div className="ring-dourado-200 overflow-hidden rounded bg-white ring-1">
      <p className="text-ink-700 border-dourado-100 border-b px-5 py-3 text-sm">
        {/* Cortada a lista, o servidor deixa de mandar o total exato (migração
            0018): dizer "2254 resultados" a quem só pode ver dez entregava o
            tamanho da base a quem não tem acesso a ela. */}
        {search.truncated
          ? "Mais de 10 resultados · escreva mais para refinar"
          : `${search.total} ${search.total === 1 ? "resultado" : "resultados"}`}
      </p>

      <ul>
        {search.results.map((match) => (
          <li key={match.id} className="border-dourado-100 border-b last:border-0">
            <button
              type="button"
              onClick={() => onOpen(match)}
              className="hover:bg-dourado-50 flex w-full flex-wrap items-start gap-x-3 gap-y-2 px-5 py-3 text-left sm:items-center sm:py-4"
            >
              <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                <span className="text-ink-900 font-display block text-lg">
                  {match.name}
                </span>
                <span className="text-ink-700 block text-sm">
                  N.º {match.employeeNumber} · {match.companyName}
                </span>
                {match.email && (
                  <span className="text-ink-700 block text-sm break-all">
                    {match.email}
                  </span>
                )}
              </span>

              {match.kitDelivered ? (
                <span className="bg-laranja-500 text-ink-800 shrink-0 rounded px-2 py-0.5 text-xs font-semibold">
                  Já entregue
                </span>
              ) : (
                <span className="border-dourado-600 text-dourado-700 shrink-0 rounded border px-2 py-0.5 text-xs font-semibold">
                  Por entregar
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {/* Encontrar homónimos e não encontrar a pessoa é o caso mais comum de
          todos: três Danielas e nenhuma é aquela. Sem esta saída, a lista era
          um beco. */}
      <div className="border-dourado-100 border-t px-5 py-3">
        <Button type="button" variant="contorno" onClick={onAusente}>
          Nenhum destes? Acrescentar colaborador
        </Button>
      </div>
    </div>
  );
}

/**
 * Ninguém com aquele número ou nome — e a pessoa está ali à frente.
 *
 * O formulário chega preenchido com o que acabou de ser escrito: quem
 * pesquisou por número já o tem, quem pesquisou por nome já o escreveu. Falta
 * sempre a empresa, que é por onde a entrega é contabilizada, e é por isso o
 * único campo que não se consegue adivinhar.
 *
 * Só cria. Editar continua a ser matéria da área administrativa, e um número
 * repetido é recusado pelo servidor em vez de reescrever quem já existe.
 */
function AusenteCard({
  employeeNumber,
  name,
  email,
  companies,
  onCancel,
  onCreate,
}: {
  employeeNumber: string;
  name: string;
  email: string;
  companies: CompanyOption[];
  onCancel: () => void;
  onCreate: (input: {
    employeeNumber: string;
    name: string;
    email: string;
    companyId: string;
  }) => void;
}) {
  const [numero, setNumero] = useState(employeeNumber);
  const [nome, setNome] = useState(name);
  const [mail, setMail] = useState(email);
  const [empresa, setEmpresa] = useState(companies.length === 1 ? companies[0]!.id : "");

  if (companies.length === 0) {
    return (
      <Alert tone="warning" title="Não existe nenhuma empresa.">
        <p>
          Um colaborador é sempre associado a uma empresa. Peça a um administrador que
          crie a empresa primeiro.
        </p>
      </Alert>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onCreate({
          employeeNumber: numero.trim(),
          name: nome.trim(),
          email: mail.trim(),
          companyId: empresa,
        });
      }}
      className="ring-dourado-200 space-y-4 rounded bg-white p-5 ring-1 sm:p-6"
    >
      <div>
        <h2 className="text-ink-900 font-display text-2xl font-normal">
          Não está na lista
        </h2>
        <p className="text-ink-700 mt-1 text-sm">
          Acrescente o colaborador para lhe poder entregar o kit.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Opcional: quem chega ao balcão nem sempre sabe o número. Vazio, a
            base de dados atribui um automático (SN0001…, migração 0020), e
            o cartão de entrega que abre a seguir mostra-o. */}
        <Field
          label="N.º colaborador"
          htmlFor="novo-numero"
          hint="Opcional. Vazio, é atribuído um (SN0001…)."
        >
          <Input
            id="novo-numero"
            value={numero}
            maxLength={40}
            autoComplete="off"
            autoCapitalize="characters"
            onChange={(event) => setNumero(event.target.value)}
          />
        </Field>

        <Field label="Nome" htmlFor="novo-nome">
          <Input
            id="novo-nome"
            value={nome}
            required
            maxLength={160}
            autoComplete="off"
            onChange={(event) => setNome(event.target.value)}
          />
        </Field>

        <Field label="Email" htmlFor="novo-email" hint="Opcional.">
          <Input
            id="novo-email"
            type="email"
            value={mail}
            maxLength={254}
            autoComplete="off"
            autoCapitalize="none"
            onChange={(event) => setMail(event.target.value)}
          />
        </Field>

        <Field label="Empresa" htmlFor="novo-empresa">
          <Select
            id="novo-empresa"
            value={empresa}
            required
            onChange={(event) => setEmpresa(event.target.value)}
          >
            <option value="">Selecione…</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg">
          Acrescentar e abrir
        </Button>
        <Button type="button" size="lg" variant="contorno" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function FoundCard({
  lookup,
  canDeliver,
  onDeliver,
  onAnular,
}: {
  lookup: EmployeeLookup;
  canDeliver: boolean;
  onDeliver: () => void;
  onAnular: (deliveryId: string) => void;
}) {
  const { employee, company, totals, delivery } = lookup;
  const alreadyDelivered = delivery !== null;
  // A anulação é destrutiva e acontece a dois toques de distância do botão
  // de entregar: pede confirmação no próprio cartão, com o nome à vista.
  const [aConfirmar, setAConfirmar] = useState(false);

  return (
    <div className="ring-dourado-200 space-y-5 rounded bg-white p-5 ring-1 sm:p-6">
      {/* Nome à esquerda e estado à direita, como no convite. Num ecrã
          estreito o estado passa para baixo do nome em vez de o apertar. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-ink-900 font-display text-3xl font-normal">
            {employee.name}
          </h2>
          <p className="text-ink-700 mt-1 text-sm">
            N.º {employee.employeeNumber} · {company.name}
          </p>
        </div>

        {alreadyDelivered ? (
          <StatusBadge state="bloqueado" label="JÁ ENTREGUE" />
        ) : (
          <StatusBadge state="disponivel" label="KIT AINDA NÃO ENTREGUE" />
        )}
      </div>

      {/* O botão vem antes do detalhe, e não depois.
          A primeira tentativa foi colá-lo ao fundo do cartão. Resolvia a
          dobra e criava pior: medido num tablet deitado com o teclado aberto,
          tapava 100% do aviso de "já entregue", 81% do painel de totais e
          cortava o crachá de estado a meio das letras. Uma barra que esconde
          a razão pela qual o botão está desativado é pior do que um botão
          que obriga a rolar.
          Pela ordem, o que decide a ação — nome, estado, botão — fica em
          cima, e o detalhe que a explica fica logo abaixo. Nada tapa nada. */}
      <Button
        type="button"
        size="xl"
        variant="evento"
        className="w-full"
        disabled={!canDeliver}
        onClick={onDeliver}
      >
        ENTREGAR KIT
      </Button>

      {canDeliver && (
        <p className="text-ink-700 text-center text-xs">
          Ou prima <kbd className="bg-ink-100 rounded px-1.5 py-0.5 font-sans">Enter</kbd>{" "}
          com o campo de pesquisa vazio.
        </p>
      )}

      {alreadyDelivered && delivery && (
        <Alert tone="error" title="Este colaborador já recebeu um kit.">
          <p>
            Entregue em {formatDateTime(delivery.deliveredAt)} por{" "}
            {delivery.deliveredBy.name}.
          </p>

          {aConfirmar ? (
            <div className="mt-3 space-y-2">
              <p className="font-semibold">
                Anular a entrega a {employee.name}? O kit volta a ficar por entregar.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => onAnular(delivery.id)}
                >
                  Confirmar anulação
                </Button>
                <Button
                  type="button"
                  variant="contorno"
                  onClick={() => setAConfirmar(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <Button
                type="button"
                variant="contorno"
                onClick={() => setAConfirmar(true)}
              >
                Entreguei por engano — anular
              </Button>
            </div>
          )}
        </Alert>
      )}

      <TotalsPanel company={company} totals={totals} />
    </div>
  );
}

function DeliveredCard({ result }: { result: DeliveryResult }) {
  const { employee, company, totals, repeated } = result;

  return (
    <div className="bg-eco-100 ring-eco-300 space-y-5 rounded p-5 ring-1 sm:p-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="bg-eco-500 text-ink-800 flex size-10 shrink-0 items-center justify-center rounded-full text-xl font-bold"
        >
          ✓
        </span>
        <div>
          <p className="text-ink-900 font-display text-2xl font-normal">
            {repeated
              ? "Kit já tinha sido entregue nesta operação."
              : "Kit entregue com sucesso."}
          </p>
          <p className="text-ink-700 mt-1 text-sm">
            {employee.name} · N.º {employee.employeeNumber}
          </p>
        </div>
      </div>

      <p className="text-ink-800 text-base font-medium">
        {company.name}: {totals.delivered}{" "}
        {totals.delivered === 1 ? "kit entregue" : "kits entregues"} em {totals.employees}{" "}
        {totals.employees === 1 ? "colaborador" : "colaboradores"}.
      </p>

      <p className="text-ink-700 text-sm">Escreva o número seguinte para continuar.</p>
    </div>
  );
}
