"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { StockPanel } from "./stock-panel";
import { StatusBadge } from "./status-badge";
import { formatDateTime } from "@/lib/format/date";
import type { DeliveryResult, EmployeeLookup } from "@/lib/validation/delivery";

type Screen =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "found"; lookup: EmployeeLookup; idempotencyKey: string }
  | { kind: "delivered"; result: DeliveryResult }
  | { kind: "error"; message: string };

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
export function DistributionScreen() {
  const [screen, setScreen] = useState<Screen>({ kind: "idle" });
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const focusSearch = useCallback(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const search = useCallback(
    async (rawNumber: string) => {
      const employeeNumber = rawNumber.trim();
      if (!employeeNumber) return;

      setScreen({ kind: "busy", label: "A pesquisar…" });
      setQuery("");

      const result = await callApi<EmployeeLookup>(
        `/api/employees/${encodeURIComponent(employeeNumber)}`,
      );

      if (!result.success) {
        setScreen({ kind: "error", message: result.message });
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

  const reset = useCallback(() => {
    setScreen({ kind: "idle" });
    setQuery("");
    focusSearch();
  }, [focusSearch]);

  useEffect(() => {
    focusSearch();
  }, [focusSearch]);

  const canDeliver =
    screen.kind === "found" &&
    screen.lookup.delivery === null &&
    screen.lookup.stock.available > 0;

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      reset();
      return;
    }

    if (event.key !== "Enter") return;
    event.preventDefault();

    if (query.trim()) {
      void search(query);
    } else if (canDeliver && screen.kind === "found") {
      void deliver(screen.lookup, screen.idempotencyKey);
    }
  }

  const busy = screen.kind === "busy";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      {/* Pesquisa ------------------------------------------------------- */}
      <div className="ring-ink-200 rounded-2xl bg-white p-5 shadow-sm ring-1 sm:p-6">
        <label
          htmlFor="employee-number"
          className="text-ink-700 block text-center text-sm font-medium"
        >
          Número de colaborador
        </label>

        <input
          ref={inputRef}
          id="employee-number"
          name="employee-number"
          type="text"
          inputMode="numeric"
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
            if (!busy) requestAnimationFrame(focusSearch);
          }}
          className="bg-ink-50 text-ink-900 ring-ink-200 mt-3 w-full rounded-xl px-4 py-5 text-center text-4xl font-semibold tracking-wider tabular-nums ring-1 focus:bg-white focus:ring-2 focus:ring-cyan-500 disabled:opacity-60"
          placeholder="—"
        />

        <div className="mt-3 flex items-center justify-center gap-3">
          <Button
            type="button"
            size="lg"
            variant="secondary"
            disabled={busy || !query.trim()}
            onClick={() => void search(query)}
          >
            Pesquisar
          </Button>
          <Button type="button" size="lg" variant="ghost" onClick={reset} disabled={busy}>
            Limpar
          </Button>
        </div>

        <p className="text-ink-700 mt-3 text-center text-xs">
          <kbd className="bg-ink-100 rounded px-1.5 py-0.5 font-sans">Enter</kbd> pesquisa
          · <kbd className="bg-ink-100 rounded px-1.5 py-0.5 font-sans">Esc</kbd> limpa
        </p>
      </div>

      {/* Resultado ------------------------------------------------------- */}
      <div aria-live="polite" aria-atomic="true" className="space-y-6">
        {screen.kind === "busy" && (
          <p className="text-ink-700 text-center text-sm">{screen.label}</p>
        )}

        {screen.kind === "error" && <Alert tone="error">{screen.message}</Alert>}

        {screen.kind === "found" && (
          <FoundCard
            lookup={screen.lookup}
            canDeliver={canDeliver}
            onDeliver={() => void deliver(screen.lookup, screen.idempotencyKey)}
          />
        )}

        {screen.kind === "delivered" && <DeliveredCard result={screen.result} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function FoundCard({
  lookup,
  canDeliver,
  onDeliver,
}: {
  lookup: EmployeeLookup;
  canDeliver: boolean;
  onDeliver: () => void;
}) {
  const { employee, company, stock, delivery } = lookup;
  const alreadyDelivered = delivery !== null;
  const exhausted = !alreadyDelivered && stock.available === 0;

  return (
    <div className="ring-ink-200 space-y-5 rounded-2xl bg-white p-5 shadow-sm ring-1 sm:p-6">
      <div>
        <h2 className="text-ink-900 text-2xl font-semibold">{employee.name}</h2>
        <p className="text-ink-700 mt-1 text-sm">
          N.º {employee.employeeNumber} · {company.name}
        </p>
      </div>

      <div>
        {alreadyDelivered ? (
          <StatusBadge state="bloqueado" label="JÁ ENTREGUE" />
        ) : exhausted ? (
          <StatusBadge state="bloqueado" label="STOCK ESGOTADO" />
        ) : (
          <StatusBadge state="disponivel" label="KIT AINDA NÃO ENTREGUE" />
        )}
      </div>

      {alreadyDelivered && delivery && (
        <Alert tone="error" title="Este colaborador já recebeu um kit.">
          <p>
            Entregue em {formatDateTime(delivery.deliveredAt)} por{" "}
            {delivery.deliveredBy.name}.
          </p>
        </Alert>
      )}

      {exhausted && (
        <Alert tone="error" title="A empresa atingiu o limite de kits.">
          <p>Contacte um administrador para rever o limite atribuído.</p>
        </Alert>
      )}

      <StockPanel company={company} stock={stock} />

      <Button
        type="button"
        size="xl"
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
    </div>
  );
}

function DeliveredCard({ result }: { result: DeliveryResult }) {
  const { employee, company, stock, repeated } = result;

  return (
    <div className="bg-eco-100 ring-eco-300 space-y-5 rounded-2xl p-5 ring-1 sm:p-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="bg-eco-500 text-ink-800 flex size-10 shrink-0 items-center justify-center rounded-full text-xl font-bold"
        >
          ✓
        </span>
        <div>
          <p className="text-ink-900 text-xl font-semibold">
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
        {company.name}: {stock.available}{" "}
        {stock.available === 1 ? "kit ainda disponível" : "kits ainda disponíveis"}.
      </p>

      <p className="text-ink-700 text-sm">Escreva o número seguinte para continuar.</p>
    </div>
  );
}
