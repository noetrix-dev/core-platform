import type { TransactionRow } from "@/lib/financas/types";

const ROTULO_MOVIMENTO: Record<TransactionRow["movement"], string> = {
  income: "Entrada",
  expense: "Saída",
  investment: "Investimento",
};

export function UltimosLancamentos({ linhas }: { linhas: TransactionRow[] }) {
  return (
    <section className="border px-4 py-3">
      <h2 className="font-semibold mb-2">Últimos lançamentos</h2>
      {linhas.length === 0 ? (
        <p className="text-sm text-gray-500">Nada pago nos últimos 7 dias.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {linhas.map((l) => (
            <li key={l.id} className="py-2 flex justify-between text-sm">
              <span>
                {l.description}{" "}
                <span className="text-xs text-gray-500">({ROTULO_MOVIMENTO[l.movement]})</span>
              </span>
              <span className="flex gap-3">
                <span>{l.payment_date}</span>
                <span>R$ {l.amount.toFixed(2)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
