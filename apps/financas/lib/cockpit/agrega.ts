import type { CategoryRow, TransactionRow } from "../financas/types.ts";

export type ResumoMes = {
  rendaRecebida: number;
  investidoNoMes: number;
  gastosPorBucket: {
    necessidade: number;
    desejo: number;
    investimento: number;
    sem_classificacao: number;
  };
};

const cent = (n: number) => Math.round(n * 100) / 100;

export function agregarMes(
  transacoes: TransactionRow[],
  categorias: CategoryRow[],
): ResumoMes {
  const bucketDe = new Map(categorias.map((c) => [c.id, c.bucket]));
  const g = { necessidade: 0, desejo: 0, investimento: 0, sem_classificacao: 0 };
  let rendaRecebida = 0;
  let investidoNoMes = 0;

  for (const t of transacoes) {
    if (t.movement === "income") {
      if (t.status === "paid") rendaRecebida = cent(rendaRecebida + t.amount);
      continue;
    }
    if (t.movement === "investment") investidoNoMes = cent(investidoNoMes + t.amount);
    const b = (t.category_id && bucketDe.get(t.category_id)) || null;
    const chave = b ?? "sem_classificacao";
    g[chave] = cent(g[chave] + t.amount);
  }

  return { rendaRecebida, investidoNoMes, gastosPorBucket: g };
}
