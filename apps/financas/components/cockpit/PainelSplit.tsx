import type { SplitResult } from "@/lib/cockpit/split";

const ROTULOS = {
  necessidade: "Necessidades (50%)",
  desejo: "Desejos (30%)",
  investimento: "Investimento (20%)",
} as const;

const BALDES: Array<keyof typeof ROTULOS> = ["necessidade", "desejo", "investimento"];

export function PainelSplit({ split }: { split: SplitResult }) {
  if (split.metas.investimento === 0) {
    return (
      <section className="border px-4 py-3">
        <h2 className="font-semibold mb-2">Split 50/30/20</h2>
        <p className="text-sm text-gray-500">Aguardando a primeira renda do mês.</p>
      </section>
    );
  }

  return (
    <section className="border px-4 py-3 flex flex-col gap-3">
      <h2 className="font-semibold">Split 50/30/20</h2>
      {BALDES.map((b) => {
        const meta = split.metas[b];
        const real = split.real[b];
        const pct = meta > 0 ? Math.min((real / meta) * 100, 100) : 0;
        const estourou = split.estouro[b];
        return (
          <div key={b} className="text-sm">
            <div className="flex justify-between">
              <span>{ROTULOS[b]}</span>
              <span className={estourou ? "text-red-700 font-semibold" : undefined}>
                R$ {real.toFixed(2)} / R$ {meta.toFixed(2)}
              </span>
            </div>
            <div className="h-2 bg-gray-100">
              <div
                className={`h-2 ${estourou ? "bg-red-600" : "bg-gray-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
      {split.real.sem_classificacao > 0 && (
        <p className="text-sm text-gray-600">
          Sem classificação: R$ {split.real.sem_classificacao.toFixed(2)}
        </p>
      )}
    </section>
  );
}
