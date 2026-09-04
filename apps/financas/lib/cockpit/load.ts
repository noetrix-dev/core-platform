import "server-only";
import { financasDb } from "@/lib/supabase/server";
import { agregarMes } from "@/lib/cockpit/agrega";
import { calcularSplit, type SplitResult } from "@/lib/cockpit/split";
import { calcularProjecao, type ProjecaoResult } from "@/lib/cockpit/projecao";
import {
  calcularKpis,
  agregarPorCategoria,
  agregarDistribuicao,
  type KpisCockpit,
  type LinhaCategoria,
  type LinhaDistribuicao,
} from "@/lib/cockpit/roscas";
import { hojeISO, fimDoMesISO } from "@/lib/datas";
import type {
  AccountRow,
  CategoryRow,
  TransactionRow,
  NoetrixMetricRow,
} from "@/lib/financas/types";

function maisDias(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type CockpitData = {
  mes: string;
  mesVigente: boolean;
  contas: AccountRow[];
  saldoTotal: number;
  kpis: KpisCockpit;
  projecao: ProjecaoResult | null;
  split: SplitResult;
  categorias: LinhaCategoria[];
  distribuicao: LinhaDistribuicao[];
  proximasContas: TransactionRow[];
  ultimosLancamentos: TransactionRow[];
  noetrix: NoetrixMetricRow | null;
  gatilhos: { clientes: boolean; churn: boolean; reserva: boolean };
  cartoes: AccountRow[];
  investidoNoMes: number;
  metaInvestimento: number;
  alertaNegativo: boolean;
};

export async function carregarCockpit(mes: string): Promise<CockpitData> {
  const db = financasDb();
  const hoje = hojeISO();
  const mesVigente = mes === hoje.slice(0, 7);
  const referencia = mesVigente ? hoje : `${mes}-01`;

  const [contasR, catsR, txR, dividasR, noetrixR, proximasR, ultimosR] = await Promise.all([
    db.from("fin_accounts").select("*").eq("ativo", true).order("name"),
    db.from("fin_categories").select("*"),
    db.from("fin_transactions").select("*").gte("due_date", `${mes}-01`).lte("due_date", `${mes}-31`),
    db.from("fin_debts").select("remaining_amount").eq("status", "ativa"),
    db.from("fin_noetrix_metrics").select("*").eq("mes", `${mes}-01`).maybeSingle(),
    db
      .from("fin_transactions")
      .select("*")
      .eq("movement", "expense")
      .eq("status", "pending")
      .gte("due_date", referencia)
      .lte("due_date", maisDias(referencia, 7))
      .order("due_date"),
    db
      .from("fin_transactions")
      .select("*")
      .not("payment_date", "is", null)
      .gte("payment_date", maisDias(hoje, -7))
      .lte("payment_date", hoje)
      .order("payment_date", { ascending: false })
      .limit(20),
  ]);
  for (const r of [contasR, catsR, txR, dividasR, proximasR, ultimosR]) {
    if (r.error) throw new Error(r.error.message);
  }
  if (noetrixR.error) throw new Error(noetrixR.error.message);

  const contas = (contasR.data ?? []) as AccountRow[];
  const categorias = (catsR.data ?? []) as CategoryRow[];
  const tx = (txR.data ?? []) as TransactionRow[];
  const noetrix = (noetrixR.data ?? null) as NoetrixMetricRow | null;

  const saldoTotal = Math.round(contas.reduce((s, c) => s + c.balance, 0) * 100) / 100;
  const kpis = calcularKpis(tx, hoje);
  const resumo = agregarMes(tx, categorias);
  const split = calcularSplit(resumo.rendaRecebida, resumo.gastosPorBucket);
  const dividasNaoPagas = Math.round(
    ((dividasR.data ?? []) as { remaining_amount: number }[]).reduce((s, d) => s + d.remaining_amount, 0) * 100,
  ) / 100;

  const projecao = mesVigente
    ? calcularProjecao({ saldoContas: saldoTotal, transacoes: tx, fimDoMesIso: fimDoMesISO(hoje) })
    : null;

  return {
    mes,
    mesVigente,
    contas,
    saldoTotal,
    kpis,
    projecao,
    split,
    categorias: agregarPorCategoria(tx, categorias),
    distribuicao: agregarDistribuicao({
      entradas: kpis.entradas,
      saidas: kpis.saidas,
      investimentos: kpis.investimentos,
      dividasNaoPagas,
    }),
    proximasContas: (proximasR.data ?? []) as TransactionRow[],
    ultimosLancamentos: (ultimosR.data ?? []) as TransactionRow[],
    noetrix,
    gatilhos: {
      clientes: (noetrix?.clientes_pagantes ?? 0) >= 80,
      churn: noetrix?.churn_pct != null && noetrix.churn_pct < 5,
      reserva: noetrix?.reserva_meses != null && noetrix.reserva_meses >= 4,
    },
    cartoes: contas.filter((c) => c.bank === "nubank" || c.bank === "inter"),
    investidoNoMes: resumo.investidoNoMes,
    metaInvestimento: split.metas.investimento,
    alertaNegativo: mesVigente && projecao !== null && projecao.projetado < 0,
  };
}
