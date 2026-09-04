import type { TransactionRow } from "@/lib/financas/types";

export function ProximasContas({
  linhas,
  mesVigente,
}: {
  linhas: TransactionRow[];
  mesVigente: boolean;
}) {
  return (
    <section className="border px-4 py-3">
      <h2 className="font-semibold mb-2">
        Próximas contas {mesVigente ? "(próximos 7 dias)" : "(a partir do dia 1, 7 dias)"}
      </h2>
      {linhas.length === 0 ? (
        <p className="text-sm text-gray-500">Nada vencendo nos próximos 7 dias.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {linhas.map((l) => (
            <li key={l.id} className="py-2 flex justify-between text-sm">
              <span>{l.description}</span>
              <span className="flex gap-3">
                <span>{l.due_date}</span>
                <span>R$ {l.amount.toFixed(2)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
