import "server-only";
import { financasDb } from "@/lib/supabase/server";
import { derivarStatus } from "@/lib/lancamentos/overdue";
import { hojeISO, fimDoMesISO } from "@/lib/datas";
import type {
  AccountRow,
  CategoryRow,
  SubcategoryRow,
  TransactionRow,
  TxStatus,
} from "@/lib/financas/types";

export type FiltroLancamentos = {
  mes: string;
  status?: TxStatus;
  contaId?: string;
  categoriaId?: string;
};

export type LinhaComStatus = TransactionRow & { statusEfetivo: TxStatus };

export type LancamentosData = {
  linhas: LinhaComStatus[];
  contas: AccountRow[];
  categorias: CategoryRow[];
  subcategorias: SubcategoryRow[];
  totais: { entradas: number; saidas: number; pendentes: number };
};

export async function carregarLancamentos(
  filtro: FiltroLancamentos,
): Promise<LancamentosData> {
  const db = financasDb();
  const inicio = `${filtro.mes}-01`;
  const fim = fimDoMesISO(`${filtro.mes}-01`);

  let q = db
    .from("fin_transactions")
    .select("*")
    .gte("due_date", inicio)
    .lte("due_date", fim)
    .order("due_date");
  if (filtro.contaId) q = q.eq("account_id", filtro.contaId);
  if (filtro.categoriaId) q = q.eq("category_id", filtro.categoriaId);

  const [tx, contas, categorias, subcategorias] = await Promise.all([
    q,
    db.from("fin_accounts").select("*").order("name"),
    db.from("fin_categories").select("*").order("name"),
    db.from("fin_subcategories").select("*").order("name"),
  ]);
  for (const r of [tx, contas, categorias, subcategorias]) {
    if (r.error) throw new Error(r.error.message);
  }

  const hoje = hojeISO();
  let linhas = ((tx.data ?? []) as TransactionRow[]).map((t) => ({
    ...t,
    statusEfetivo: derivarStatus(t, hoje),
  }));
  if (filtro.status) linhas = linhas.filter((l) => l.statusEfetivo === filtro.status);

  const totais = linhas.reduce(
    (acc, l) => {
      if (l.movement === "income") acc.entradas += l.amount;
      else acc.saidas += l.amount;
      if (l.statusEfetivo !== "paid") acc.pendentes += l.amount * (l.movement === "income" ? 0 : 1);
      return acc;
    },
    { entradas: 0, saidas: 0, pendentes: 0 },
  );

  return {
    linhas,
    contas: (contas.data ?? []) as AccountRow[],
    categorias: (categorias.data ?? []) as CategoryRow[],
    subcategorias: (subcategorias.data ?? []) as SubcategoryRow[],
    totais,
  };
}
