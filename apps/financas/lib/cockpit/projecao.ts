import type { TransactionRow } from "../financas/types.ts";

type TxParcial = Pick<
  TransactionRow,
  "movement" | "status" | "amount" | "due_date"
>;

export type EntradaProjecao = {
  saldoContas: number;
  transacoes: TxParcial[];
  fimDoMesIso: string;
};

export type ProjecaoResult = {
  projetado: number;
  entradasPrevistas: number;
  saidasPrevistas: number;
};

const cent = (n: number) => Math.round(n * 100) / 100;

export function calcularProjecao(input: EntradaProjecao): ProjecaoResult {
  let entradasPrevistas = 0;
  let saidasPrevistas = 0;

  for (const t of input.transacoes) {
    if (t.status === "paid") continue;
    if (t.due_date > input.fimDoMesIso) continue;
    if (t.movement === "income") entradasPrevistas = cent(entradasPrevistas + t.amount);
    else saidasPrevistas = cent(saidasPrevistas + t.amount);
  }

  return {
    entradasPrevistas,
    saidasPrevistas,
    projetado: cent(input.saldoContas + entradasPrevistas - saidasPrevistas),
  };
}
