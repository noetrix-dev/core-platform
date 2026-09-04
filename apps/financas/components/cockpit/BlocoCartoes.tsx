import type { AccountRow } from "@/lib/financas/types";

export function BlocoCartoes({ cartoes }: { cartoes: AccountRow[] }) {
  if (cartoes.length === 0) return null;

  return (
    <section className="border px-4 py-3">
      <h2 className="font-semibold mb-2">Cartões</h2>
      <ul className="flex flex-col divide-y">
        {cartoes.map((c) => (
          <li key={c.id} className="py-2 text-sm flex flex-col gap-1">
            <span className="font-medium">{c.name}</span>
            {c.fatura_atual === null && c.limite_disponivel === null ? (
              <span className="text-gray-500">Sem fatura lançada.</span>
            ) : (
              <span className="flex gap-3">
                <span>
                  Fatura: {c.fatura_atual !== null ? `R$ ${c.fatura_atual.toFixed(2)}` : "—"}
                </span>
                <span>
                  Limite disponível:{" "}
                  {c.limite_disponivel !== null ? `R$ ${c.limite_disponivel.toFixed(2)}` : "—"}
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
