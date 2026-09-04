import type { LinhaCategoria } from "@/lib/cockpit/roscas";

export function RoscaCategoria({ linhas }: { linhas: LinhaCategoria[] }) {
  if (linhas.length === 0) {
    return (
      <section className="border px-4 py-3">
        <h2 className="font-semibold mb-2">Gastos por categoria</h2>
        <p className="text-sm text-gray-500">Nenhum gasto lançado neste mês.</p>
      </section>
    );
  }

  const total = linhas.reduce((s, l) => s + l.valor, 0);

  return (
    <section className="border px-4 py-3">
      <h2 className="font-semibold mb-2">Gastos por categoria</h2>
      <ul className="flex flex-col gap-2">
        {linhas.map((l) => {
          const pct = total > 0 ? (l.valor / total) * 100 : 0;
          return (
            <li key={l.categoria} className="text-sm">
              <div className="flex justify-between">
                <span>{l.categoria}</span>
                <span>
                  R$ {l.valor.toFixed(2)} ({pct.toFixed(0)}%)
                </span>
              </div>
              <div className="h-2 bg-gray-100">
                <div className="h-2 bg-gray-500" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
