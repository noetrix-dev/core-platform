import type { NoetrixMetricRow } from "@/lib/financas/types";
import { NovaMetricaForm } from "@/components/configuracoes/NovaMetricaForm";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function mesLabel(mes: string): string {
  const [ano, mm] = mes.slice(0, 7).split("-");
  return `${mm}/${ano}`;
}

export function SecaoNoetrix({ metricas }: { metricas: NoetrixMetricRow[] }) {
  const mesAtual = new Date().toISOString().slice(0, 7);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Métricas Noetrix</h2>

      <NovaMetricaForm mesAtual={mesAtual} />

      {metricas.length === 0 && <p>Nenhuma métrica registrada ainda.</p>}

      <ul className="flex flex-col gap-2">
        {metricas.map((m) => (
          <li key={m.id} className="border p-4">
            <p className="font-medium">{mesLabel(m.mes)}</p>
            <p className="text-sm text-gray-500">
              MRR {brl(m.mrr)} · {m.clientes_pagantes} clientes
              {m.churn_pct != null && ` · churn ${m.churn_pct}%`}
              {m.reserva_meses != null && ` · reserva ${m.reserva_meses} meses`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
