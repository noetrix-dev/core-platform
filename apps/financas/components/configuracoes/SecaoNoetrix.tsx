import type { NoetrixMetricRow } from "@/lib/financas/types";
import { salvarMetricaNoetrix } from "@/app/configuracoes/actions";

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

      <form
        action={async (fd) => {
          "use server";
          await salvarMetricaNoetrix(fd);
        }}
        className="flex flex-col gap-2 border p-4"
      >
        <input
          type="month"
          name="mes"
          defaultValue={mesAtual}
          aria-label="Mês da métrica"
          required
          className="border px-4 py-3"
        />
        <input
          name="mrr"
          inputMode="decimal"
          placeholder="MRR"
          aria-label="MRR do mês"
          required
          className="border px-4 py-3"
        />
        <input
          type="number"
          name="clientes_pagantes"
          min={0}
          placeholder="Clientes pagantes"
          aria-label="Clientes pagantes do mês"
          required
          className="border px-4 py-3"
        />
        <input
          name="churn_pct"
          inputMode="decimal"
          placeholder="Churn % (opcional)"
          aria-label="Churn percentual do mês"
          className="border px-4 py-3"
        />
        <input
          name="reserva_meses"
          inputMode="decimal"
          placeholder="Reserva em meses (opcional)"
          aria-label="Reserva em meses do mês"
          className="border px-4 py-3"
        />
        <button type="submit" className="border px-4 py-3">
          Salvar métrica
        </button>
      </form>

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
