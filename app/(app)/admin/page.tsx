import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard · Kits" };

export default function AdminPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-ink-900 text-xl font-semibold">Dashboard</h1>
      <p className="text-ink-500 text-sm">
        O resumo por empresa é implementado numa etapa posterior.
      </p>
    </div>
  );
}
