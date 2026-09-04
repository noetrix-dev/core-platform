import "server-only";
import { financasDb } from "@/lib/supabase/server";
import { progressoAgregado, type AgregadoResult } from "@/lib/dividas/progresso";
import type { AccountRow, DebtRow } from "@/lib/financas/types";

export type DividasData = {
  dividas: DebtRow[];
  contas: AccountRow[];
  agregado: AgregadoResult;
};

export async function carregarDividas(): Promise<DividasData> {
  const db = financasDb();
  const [dv, contas] = await Promise.all([
    db.from("fin_debts").select("*").order("grupo").order("remaining_amount", { ascending: false }),
    db.from("fin_accounts").select("*").eq("ativo", true).order("name"),
  ]);
  if (dv.error) throw new Error(dv.error.message);
  if (contas.error) throw new Error(contas.error.message);

  const dividas = (dv.data ?? []) as DebtRow[];
  return {
    dividas,
    contas: (contas.data ?? []) as AccountRow[],
    agregado: progressoAgregado(dividas),
  };
}
