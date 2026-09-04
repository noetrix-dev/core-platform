import { somaMesesISO } from "../datas.ts";
import type { Movement, NovaTransacao } from "../financas/types.ts";

export type EntradaParcelas = {
  descricao: string;
  valorTotal: number;
  primeiroVencimento: string;
  parcelas: number;
  movement: Movement;
  accountId?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  groupId: string;
};

const cent = (n: number) => Math.round(n * 100) / 100;

export function expandirParcelas(input: EntradaParcelas): NovaTransacao[] {
  const { valorTotal, parcelas: n } = input;
  if (!Number.isInteger(n) || n < 1) throw new Error("parcelas invalido");
  if (!(valorTotal > 0)) throw new Error("valorTotal invalido");

  const base = cent(valorTotal / n);
  const linhas: NovaTransacao[] = [];
  let acumulado = 0;

  for (let i = 1; i <= n; i++) {
    const amount = i === n ? cent(valorTotal - acumulado) : base;
    acumulado = cent(acumulado + amount);
    linhas.push({
      description: `${input.descricao} (${i}/${n})`,
      amount,
      movement: input.movement,
      type: "installment",
      status: "pending",
      due_date: somaMesesISO(input.primeiroVencimento, i - 1),
      account_id: input.accountId ?? null,
      category_id: input.categoryId ?? null,
      subcategory_id: input.subcategoryId ?? null,
      installment_current: i,
      installment_total: n,
      installment_group_id: input.groupId,
      source: "manual",
    });
  }
  return linhas;
}
