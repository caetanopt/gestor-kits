"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type ApiEnvelope =
  { success: true; data: unknown } | { success: false; code: string; message: string };

/**
 * Anulação de uma entrega.
 *
 * Pede confirmação explícita antes de agir (secção 20). O backend é
 * idempotente: anular uma entrega já anulada devolve ALREADY_REVERSED em vez
 * de descontar stock a mais.
 */
export function ReverseDeliveryButton({
  deliveryId,
  employeeLabel,
}: {
  deliveryId: string;
  employeeLabel: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reverse() {
    setBusy(true);
    setError(null);

    const response = await fetch(`/api/deliveries/${deliveryId}/reverse`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() || undefined }),
    }).catch(() => null);

    const result = (await response?.json().catch(() => null)) as ApiEnvelope | null;
    setBusy(false);

    if (!result) {
      setError("Sem ligação ao servidor.");
      return;
    }
    if (!result.success) {
      setError(result.message);
      return;
    }

    setConfirming(false);
    setReason("");
    router.refresh();
  }

  if (!confirming) {
    return (
      <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
        Anular
      </Button>
    );
  }

  return (
    <div className="bg-warning-soft ring-warning/40 space-y-2 rounded-xl p-3 text-left ring-1">
      <p className="text-ink-800 text-sm font-medium">
        Anular a entrega a {employeeLabel}?
      </p>
      <p className="text-ink-600 text-xs">O kit volta a ficar disponível.</p>

      {error && <Alert tone="error">{error}</Alert>}

      <label htmlFor={`reason-${deliveryId}`} className="sr-only">
        Motivo da anulação
      </label>
      <input
        id={`reason-${deliveryId}`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={500}
        placeholder="Motivo (opcional)"
        className="ring-ink-200 w-full rounded-lg bg-white px-3 py-2 text-sm ring-1"
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="danger"
          disabled={busy}
          onClick={() => void reverse()}
        >
          {busy ? "A anular…" : "Confirmar anulação"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}
