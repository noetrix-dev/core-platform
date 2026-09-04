import type { KpisCockpit as KpisCockpitData } from "@/lib/cockpit/roscas";

export function KpisCockpit({ kpis }: { kpis: KpisCockpitData }) {
  const saldoCor = kpis.saldo >= 0 ? "text-green-700" : "text-red-700";

  return (
    <section className="border px-4 py-3 flex flex-col gap-3">
      <div>
        <p className="text-sm">Saldo do mês</p>
        <p className={`text-3xl font-bold ${saldoCor}`}>R$ {kpis.saldo.toFixed(2)}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        <div>
          <dt className="text-xs text-gray-500">Entradas</dt>
          <dd>R$ {kpis.entradas.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Saídas</dt>
          <dd>R$ {kpis.saidas.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">A vencer</dt>
          <dd>R$ {kpis.aVencer.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Vencidas</dt>
          <dd className={kpis.vencidas > 0 ? "text-red-700" : undefined}>
            R$ {kpis.vencidas.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Investimentos</dt>
          <dd>R$ {kpis.investimentos.toFixed(2)}</dd>
        </div>
      </dl>
    </section>
  );
}
