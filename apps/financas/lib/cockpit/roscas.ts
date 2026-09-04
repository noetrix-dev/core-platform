import { derivarStatus } from "../lancamentos/overdue.ts";
import type { CategoryRow, TransactionRow } from "../financas/types.ts";

type TxKpi = Pick<TransactionRow, "movement" | "amount" | "status" | "due_date">;

export type KpisCockpit = {
  entradas: number;
  saidas: number;
  aVencer: number;
  vencidas: number;
  investimentos: number;
  saldo: number;
};

const cent = (n: number) => Math.round(n * 100) / 100;

export function calcularKpis(transacoes: TxKpi[], hojeIso: string): KpisCockpit {
  let entradas = 0, saidas = 0, aVencer = 0, vencidas = 0, investimentos = 0;
  for (const t of transacoes) {
    const efetivo = derivarStatus({ status: t.status, due_date: t.due_date }, hojeIso);
    if (t.movement === "investment") {
      investimentos = cent(investimentos + t.amount);
    } else if (t.movement === "income") {
      if (efetivo === "paid") entradas = cent(entradas + t.amount);
    } else {
      if (efetivo === "paid") saidas = cent(saidas + t.amount);
      else if (efetivo === "pending") aVencer = cent(aVencer + t.amount);
      else vencidas = cent(vencidas + t.amount);
    }
  }
  return {
    entradas, saidas, aVencer, vencidas, investimentos,
    saldo: cent(entradas - saidas - investimentos),
  };
}

export type LinhaCategoria = { categoria: string; valor: number };

export function agregarPorCategoria(
  transacoes: Pick<TransactionRow, "movement" | "amount" | "category_id">[],
  categorias: Pick<CategoryRow, "id" | "name">[],
): LinhaCategoria[] {
  const nomeDe = new Map(categorias.map((c) => [c.id, c.name]));
  const soma = new Map<string, number>();
  for (const t of transacoes) {
    if (t.movement !== "expense" && t.movement !== "investment") continue;
    const nome = (t.category_id && nomeDe.get(t.category_id)) || "Sem categoria";
    soma.set(nome, cent((soma.get(nome) ?? 0) + t.amount));
  }
  return [...soma.entries()]
    .map(([categoria, valor]) => ({ categoria, valor }))
    .sort((a, b) => b.valor - a.valor);
}

export type LinhaDistribuicao = {
  label: "entradas" | "saidas" | "investimentos" | "dividas_nao_pagas";
  valor: number;
};

export function agregarDistribuicao(input: {
  entradas: number;
  saidas: number;
  investimentos: number;
  dividasNaoPagas: number;
}): LinhaDistribuicao[] {
  return [
    { label: "entradas", valor: input.entradas },
    { label: "saidas", valor: input.saidas },
    { label: "investimentos", valor: input.investimentos },
    { label: "dividas_nao_pagas", valor: input.dividasNaoPagas },
  ];
}
