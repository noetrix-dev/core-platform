import Link from "next/link";
import type { NoetrixMetricRow } from "@/lib/financas/types";

export function BlocoNoetrix({
  noetrix,
  gatilhos,
}: {
  noetrix: NoetrixMetricRow | null;
  gatilhos: { clientes: boolean; churn: boolean; reserva: boolean };
}) {
  if (!noetrix) {
    return (
      <section className="border px-4 py-3">
        <h2 className="font-semibold mb-2">Noetrix</h2>
        <p className="text-sm text-gray-500">
          Sem métrica lançada neste mês.{" "}
          <Link href="/configuracoes" className="underline">
            Lançar em Configurações
          </Link>
        </p>
      </section>
    );
  }

  const cor = (ok: boolean) => (ok ? "text-green-700" : "text-red-700");

  return (
    <section className="border px-4 py-3 flex flex-col gap-3">
      <h2 className="font-semibold">Noetrix</h2>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-gray-500">MRR</p>
          <p>R$ {noetrix.mrr.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Clientes pagantes</p>
          <p>{noetrix.clientes_pagantes}</p>
        </div>
      </div>
      <ul className="text-sm flex flex-col gap-1">
        <li className={cor(gatilhos.clientes)}>
          {gatilhos.clientes ? "OK" : "Atenção"} — clientes pagantes ≥ 80
        </li>
        <li className={cor(gatilhos.churn)}>{gatilhos.churn ? "OK" : "Atenção"} — churn &lt; 5%</li>
        <li className={cor(gatilhos.reserva)}>
          {gatilhos.reserva ? "OK" : "Atenção"} — reserva ≥ 4 meses
        </li>
      </ul>
    </section>
  );
}
