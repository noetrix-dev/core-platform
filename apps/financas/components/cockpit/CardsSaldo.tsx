import type { AccountRow } from "@/lib/financas/types";
import type { ProjecaoResult } from "@/lib/cockpit/projecao";

export function CardsSaldo({
  contas,
  saldoTotal,
  projecao,
}: {
  contas: AccountRow[];
  saldoTotal: number;
  projecao: ProjecaoResult | null;
}) {
  return (
    <section className="border px-4 py-3 flex flex-col gap-3">
      <h2 className="font-semibold">Saldos</h2>
      <ul className="flex flex-col divide-y">
        {contas.map((c) => (
          <li key={c.id} className="py-2 flex justify-between text-sm">
            <span>
              {c.name} <span className="text-xs text-gray-500">({c.bank})</span>
            </span>
            <span className={c.balance < 0 ? "text-red-700" : undefined}>
              R$ {c.balance.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between text-sm font-semibold pt-2 border-t">
        <span>Total</span>
        <span className={saldoTotal < 0 ? "text-red-700" : undefined}>
          R$ {saldoTotal.toFixed(2)}
        </span>
      </div>
      {projecao !== null && (
        <div className="text-sm border-t pt-2 flex flex-col gap-1">
          <p className="font-semibold">Projeção fim do mês</p>
          <div className="flex justify-between">
            <span>Entradas previstas</span>
            <span>R$ {projecao.entradasPrevistas.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Saídas previstas</span>
            <span>R$ {projecao.saidasPrevistas.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Projetado</span>
            <span className={projecao.projetado < 0 ? "text-red-700" : undefined}>
              R$ {projecao.projetado.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
