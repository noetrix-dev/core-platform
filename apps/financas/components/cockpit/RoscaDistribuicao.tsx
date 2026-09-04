import type { LinhaDistribuicao } from "@/lib/cockpit/roscas";

const ROTULOS: Record<LinhaDistribuicao["label"], string> = {
  entradas: "Entradas",
  saidas: "Saídas",
  investimentos: "Investimentos",
  dividas_nao_pagas: "Dívidas não pagas",
};

export function RoscaDistribuicao({ linhas }: { linhas: LinhaDistribuicao[] }) {
  const total = linhas.reduce((s, l) => s + l.valor, 0);

  return (
    <section className="border px-4 py-3">
      <h2 className="font-semibold mb-2">Distribuição do mês</h2>
      {total === 0 ? (
        <p className="text-sm text-gray-500">Nenhum valor lançado neste mês.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {linhas.map((l) => {
            const pct = total > 0 ? (l.valor / total) * 100 : 0;
            return (
              <li key={l.label} className="text-sm">
                <div className="flex justify-between">
                  <span>{ROTULOS[l.label]}</span>
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
      )}
    </section>
  );
}
