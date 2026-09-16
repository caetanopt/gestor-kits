"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { ImportReport } from "@/server/use-cases/import-employees";

type ApiEnvelope =
  | { success: true; data: ImportReport }
  | { success: false; code: string; message: string; details?: string[] };

export function ImportWizard({ hasCompanies }: { hasCompanies: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(commit: boolean) {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Selecione um ficheiro.");
      return;
    }

    setBusy(true);
    setError(null);

    const body = new FormData();
    body.append("file", file);
    body.append("commit", String(commit));

    const response = await fetch("/api/import", { method: "POST", body }).catch(
      () => null,
    );
    const result = (await response?.json().catch(() => null)) as ApiEnvelope | null;
    setBusy(false);

    if (!result) {
      setError("Sem ligação ao servidor. Tente novamente.");
      return;
    }
    if (!result.success) {
      setError(result.details?.[0] ?? result.message);
      setReport(null);
      return;
    }

    setReport(result.data);
    if (result.data.committed) router.refresh();
  }

  const blocking = report ? report.issues.length + report.duplicatesInFile.length : 0;

  return (
    <div className="space-y-6">
      {!hasCompanies && (
        <Alert tone="warning" title="Crie primeiro as empresas.">
          <p>
            A importação associa cada colaborador a uma empresa existente. Linhas com
            empresas desconhecidas são rejeitadas.
          </p>
        </Alert>
      )}

      <div className="ring-ink-200 space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1">
        <div>
          <label htmlFor="import-file" className="text-ink-700 block text-sm font-medium">
            Ficheiro de colaboradores
          </label>
          <input
            ref={fileRef}
            id="import-file"
            type="file"
            accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={() => {
              setReport(null);
              setError(null);
            }}
            className="text-ink-700 ring-ink-200 file:bg-ink-100 file:text-ink-700 mt-2 block w-full rounded-lg text-sm ring-1 file:mr-3 file:rounded-l-lg file:border-0 file:px-4 file:py-2.5 file:text-sm file:font-medium"
          />
          <p className="text-ink-500 mt-2 text-xs">
            CSV ou Excel (.xlsx). Colunas:{" "}
            <code className="bg-ink-100 rounded px-1">employee_number</code>,{" "}
            <code className="bg-ink-100 rounded px-1">name</code>,{" "}
            <code className="bg-ink-100 rounded px-1">company</code>. São aceites
            cabeçalhos em português (número, nome, empresa) e o separador{" "}
            <code className="bg-ink-100 rounded px-1">;</code> do Excel português.
          </p>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void send(false)}
          >
            {busy ? "A analisar…" : "Analisar ficheiro"}
          </Button>
          {report && !report.committed && report.toCreate > 0 && (
            <Button type="button" disabled={busy} onClick={() => void send(true)}>
              Importar {report.toCreate}{" "}
              {report.toCreate === 1 ? "colaborador" : "colaboradores"}
            </Button>
          )}
        </div>
      </div>

      {report && <ReportView report={report} blocking={blocking} />}
    </div>
  );
}

function ReportView({ report, blocking }: { report: ImportReport; blocking: number }) {
  return (
    <div className="space-y-4">
      {report.committed ? (
        <Alert tone="success" title="Importação concluída.">
          <p>
            {report.inserted}{" "}
            {report.inserted === 1 ? "colaborador criado" : "colaboradores criados"}
            {report.skipped > 0 && `, ${report.skipped} ignorados por já existirem`}.
          </p>
        </Alert>
      ) : (
        <Alert tone={blocking > 0 ? "warning" : "info"} title="Pré-visualização">
          <p>
            {report.totalDataRows} linhas lidas · {report.toCreate} por criar ·{" "}
            {report.alreadyExists.length} já existem · {blocking} com problemas.
          </p>
          {blocking > 0 && (
            <p className="mt-1">
              As linhas com problemas são ignoradas; as restantes podem ser importadas.
            </p>
          )}
        </Alert>
      )}

      {report.preview.length > 0 && !report.committed && (
        <div className="ring-ink-200 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1">
          <table className="w-full text-sm">
            <caption className="text-ink-700 px-4 py-3 text-left text-sm font-medium">
              Primeiros colaboradores a criar
            </caption>
            <thead>
              <tr className="border-ink-200 text-ink-600 border-y text-left">
                <th scope="col" className="px-4 py-2 font-medium">
                  Número
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Nome
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Empresa
                </th>
              </tr>
            </thead>
            <tbody>
              {report.preview.map((row) => (
                <tr
                  key={row.employeeNumber}
                  className="border-ink-100 border-b last:border-0"
                >
                  <td className="px-4 py-2 tabular-nums">{row.employeeNumber}</td>
                  <td className="px-4 py-2">{row.name}</td>
                  <td className="text-ink-500 px-4 py-2">{row.companyName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <IssueList title="Problemas" issues={report.issues} tone="error" />
      <IssueList
        title="Números repetidos no ficheiro"
        issues={report.duplicatesInFile}
        tone="error"
      />
      <IssueList
        title="Colaboradores que já existiam"
        issues={report.alreadyExists}
        tone="info"
      />
    </div>
  );
}

function IssueList({
  title,
  issues,
  tone,
}: {
  title: string;
  issues: { line: number; message: string }[];
  tone: "error" | "info";
}) {
  if (issues.length === 0) return null;

  const shown = issues.slice(0, 50);

  return (
    <details className="ring-ink-200 rounded-2xl bg-white p-4 shadow-sm ring-1">
      <summary className="text-ink-800 cursor-pointer text-sm font-medium">
        {title} ({issues.length})
      </summary>
      <ul className="mt-3 space-y-1.5 text-sm">
        {shown.map((issue, index) => (
          <li key={`${issue.line}-${index}`} className="flex gap-2">
            <span className="text-ink-400 shrink-0 tabular-nums">linha {issue.line}</span>
            <span className={tone === "error" ? "text-blocked" : "text-ink-600"}>
              {issue.message}
            </span>
          </li>
        ))}
      </ul>
      {issues.length > shown.length && (
        <p className="text-ink-500 mt-2 text-xs">
          … e mais {issues.length - shown.length}.
        </p>
      )}
    </details>
  );
}
