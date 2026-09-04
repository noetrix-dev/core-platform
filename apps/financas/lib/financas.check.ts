import assert from "node:assert/strict";
import { somaMesesISO, fimDoMesISO } from "./datas.ts";
import { expandirParcelas } from "./lancamentos/parcelas.ts";
import { gerarTransacoesDoMes } from "./lancamentos/recorrentes.ts";
import { derivarStatus } from "./lancamentos/overdue.ts";
import { agregarMes } from "./cockpit/agrega.ts";
import { calcularSplit } from "./cockpit/split.ts";
import { calcularKpis, agregarPorCategoria, agregarDistribuicao } from "./cockpit/roscas.ts";
import { calcularProjecao } from "./cockpit/projecao.ts";
import { progressoDivida, progressoAgregado } from "./dividas/progresso.ts";
import type { CategoryRow, TransactionRow, DebtRow } from "./financas/types.ts";

// --- datas ---
assert.equal(somaMesesISO("2026-01-15", 1), "2026-02-15");
assert.equal(somaMesesISO("2026-01-31", 1), "2026-02-28", "clamp fev");
assert.equal(somaMesesISO("2026-11-30", 1), "2026-12-30");
assert.equal(somaMesesISO("2026-12-10", 1), "2027-01-10", "vira ano");
assert.equal(somaMesesISO("2026-01-31", 13), "2027-02-28", "clamp + ano");
assert.equal(fimDoMesISO("2026-02-10"), "2026-02-28");
assert.equal(fimDoMesISO("2024-02-10"), "2024-02-29", "bissexto");
assert.equal(fimDoMesISO("2026-07-01"), "2026-07-31");

// --- expandirParcelas ---
{
  const p = expandirParcelas({
    descricao: "Notebook",
    valorTotal: 3000,
    primeiroVencimento: "2026-01-10",
    parcelas: 3,
    movement: "expense",
    groupId: "g1",
  });
  assert.equal(p.length, 3);
  assert.deepEqual(
    p.map((x) => x.due_date),
    ["2026-01-10", "2026-02-10", "2026-03-10"],
  );
  assert.deepEqual(
    p.map((x) => x.installment_current),
    [1, 2, 3],
  );
  assert.ok(p.every((x) => x.installment_group_id === "g1"));
  assert.equal(p.reduce((s, x) => s + x.amount, 0), 3000, "soma fecha");
  assert.equal(p[0].description, "Notebook (1/3)");
  assert.equal(p[0].type, "installment");
}
{
  const p = expandirParcelas({
    descricao: "Curso",
    valorTotal: 100,
    primeiroVencimento: "2026-01-31",
    parcelas: 3,
    movement: "expense",
    groupId: "g2",
  });
  assert.equal(p.reduce((s, x) => s + x.amount, 0), 100, "rateio 33.33/33.33/33.34");
  assert.deepEqual(
    p.map((x) => x.due_date),
    ["2026-01-31", "2026-02-28", "2026-03-31"],
    "clamp de fevereiro",
  );
}
{
  const p = expandirParcelas({
    descricao: "X",
    valorTotal: 50,
    primeiroVencimento: "2026-05-01",
    parcelas: 1,
    movement: "expense",
    groupId: "g3",
  });
  assert.equal(p.length, 1);
  assert.equal(p[0].amount, 50);
}
assert.throws(() =>
  expandirParcelas({
    descricao: "X",
    valorTotal: 10,
    primeiroVencimento: "2026-01-01",
    parcelas: 0,
    movement: "expense",
    groupId: "g4",
  }),
);
assert.throws(() =>
  expandirParcelas({
    descricao: "X",
    valorTotal: 10,
    primeiroVencimento: "2026-01-01",
    parcelas: 2.5,
    movement: "expense",
    groupId: "g5",
  }),
);

// --- gerarTransacoesDoMes ---
{
  const tpls = [
    { id: "t1", description: "Aluguel", amount: 1800, movement: "expense",
      category_id: "c1", subcategory_id: null, account_id: "a1",
      day_of_month: 10, type: "fixed", ativo: true },
    { id: "t2", description: "Salário", amount: 4597, movement: "income",
      category_id: "c2", subcategory_id: null, account_id: "a1",
      day_of_month: 5, type: "fixed", ativo: true },
    { id: "t3", description: "Inativo", amount: 10, movement: "expense",
      category_id: null, subcategory_id: null, account_id: null,
      day_of_month: 1, type: "fixed", ativo: false },
    { id: "t4", description: "Fatura", amount: 500, movement: "expense",
      category_id: null, subcategory_id: null, account_id: null,
      day_of_month: 31, type: "fixed", ativo: true },
  ] as const;

  const out = gerarTransacoesDoMes([...tpls], [], { ano: 2026, mes: 2 });
  assert.equal(out.length, 3, "t3 inativo fora");
  const aluguel = out.find((x) => x.recurring_template_id === "t1")!;
  assert.equal(aluguel.due_date, "2026-02-10");
  assert.equal(aluguel.is_recurring, true);
  const fatura = out.find((x) => x.recurring_template_id === "t4")!;
  assert.equal(fatura.due_date, "2026-02-28", "clamp dia 31 em fevereiro");

  const out2 = gerarTransacoesDoMes(
    [...tpls],
    [{ recurring_template_id: "t1", due_date: "2026-02-10" }],
    { ano: 2026, mes: 2 },
  );
  assert.equal(out2.length, 2, "t1 já existe no mês");
  assert.ok(!out2.some((x) => x.recurring_template_id === "t1"));
}

// --- derivarStatus ---
assert.equal(derivarStatus({ status: "pending", due_date: "2026-01-01" }, "2026-02-01"), "overdue");
assert.equal(derivarStatus({ status: "pending", due_date: "2026-03-01" }, "2026-02-01"), "pending");
assert.equal(derivarStatus({ status: "pending", due_date: "2026-02-01" }, "2026-02-01"), "pending", "vence hoje");
assert.equal(derivarStatus({ status: "paid", due_date: "2020-01-01" }, "2026-02-01"), "paid", "paid nunca vira overdue");
assert.equal(derivarStatus({ status: "overdue", due_date: "2026-03-01" }, "2026-02-01"), "pending", "recalcula a partir da data");

// --- agregarMes / calcularSplit ---
{
  const cats = [
    { id: "c1", name: "Mercado", type: "expense", bucket: "necessidade", color: null, icon: null, ativo: true },
    { id: "c2", name: "Lazer", type: "expense", bucket: "desejo", color: null, icon: null, ativo: true },
    { id: "c3", name: "Aporte", type: "investment", bucket: "investimento", color: null, icon: null, ativo: true },
    { id: "c4", name: "Salário", type: "income", bucket: null, color: null, icon: null, ativo: true },
  ] as unknown as CategoryRow[];
  const tx = [
    { movement: "income", status: "paid", amount: 4000, category_id: "c4" },
    { movement: "income", status: "pending", amount: 1000, category_id: "c4" },
    { movement: "expense", status: "paid", amount: 1200, category_id: "c1" },
    { movement: "expense", status: "pending", amount: 300, category_id: "c2" },
    { movement: "investment", status: "paid", amount: 500, category_id: "c3" },
    { movement: "expense", status: "paid", amount: 90, category_id: null },
  ] as unknown as TransactionRow[];

  const r = agregarMes(tx, cats);
  assert.equal(r.rendaRecebida, 4000, "só income paid");
  assert.equal(r.investidoNoMes, 500);
  assert.equal(r.gastosPorBucket.necessidade, 1200);
  assert.equal(r.gastosPorBucket.desejo, 300);
  assert.equal(r.gastosPorBucket.investimento, 500);
  assert.equal(r.gastosPorBucket.sem_classificacao, 90);

  const s = calcularSplit(r.rendaRecebida, r.gastosPorBucket);
  assert.deepEqual(s.metas, { necessidade: 2000, desejo: 1200, investimento: 800 });
  assert.equal(s.estouro.necessidade, false);
  assert.equal(s.estouro.desejo, false);
  assert.equal(s.estouro.investimento, false);
}
{
  const s = calcularSplit(0, { necessidade: 50, desejo: 0, investimento: 0, sem_classificacao: 0 });
  assert.deepEqual(s.metas, { necessidade: 0, desejo: 0, investimento: 0 });
  assert.equal(s.estouro.necessidade, true, "meta 0 e real > 0 estoura");
}

// --- calcularKpis / agregarPorCategoria / agregarDistribuicao ---
{
  const tx = [
    { movement: "income", amount: 4000, status: "paid", due_date: "2026-02-05" },
    { movement: "expense", amount: 1200, status: "paid", due_date: "2026-02-03" },
    { movement: "expense", amount: 300, status: "pending", due_date: "2026-03-01" },
    { movement: "expense", amount: 90, status: "pending", due_date: "2026-01-01" }, // vencida
    { movement: "investment", amount: 500, status: "paid", due_date: "2026-02-10" },
  ] as unknown as TransactionRow[];
  const k = calcularKpis(tx, "2026-02-15");
  assert.equal(k.entradas, 4000);
  assert.equal(k.saidas, 1200);
  assert.equal(k.aVencer, 300);
  assert.equal(k.vencidas, 90);
  assert.equal(k.investimentos, 500);
  assert.equal(k.saldo, 2300, "4000 - 1200 - 500");
}
{
  const cats = [{ id: "c1", name: "Mercado" }, { id: "c2", name: "Aporte" }] as unknown as CategoryRow[];
  const tx = [
    { movement: "expense", amount: 100, category_id: "c1" },
    { movement: "expense", amount: 50, category_id: "c1" },
    { movement: "investment", amount: 200, category_id: "c2" },
    { movement: "expense", amount: 30, category_id: null },
    { movement: "income", amount: 999, category_id: "c1" },
  ] as unknown as TransactionRow[];
  const r = agregarPorCategoria(tx, cats);
  assert.deepEqual(r, [
    { categoria: "Aporte", valor: 200 },
    { categoria: "Mercado", valor: 150 },
    { categoria: "Sem categoria", valor: 30 },
  ]);
}
{
  const r = agregarDistribuicao({ entradas: 4000, saidas: 1200, investimentos: 500, dividasNaoPagas: 29500 });
  assert.deepEqual(r, [
    { label: "entradas", valor: 4000 },
    { label: "saidas", valor: 1200 },
    { label: "investimentos", valor: 500 },
    { label: "dividas_nao_pagas", valor: 29500 },
  ]);
}

// --- calcularProjecao ---
{
  const tx = [
    { movement: "income", status: "pending", amount: 4597, due_date: "2026-02-05" },
    { movement: "income", status: "pending", amount: 999, due_date: "2026-03-05" }, // fora do mês
    { movement: "income", status: "paid", amount: 100, due_date: "2026-02-01" }, // já pago, ignora
    { movement: "expense", status: "pending", amount: 1800, due_date: "2026-02-10" },
    { movement: "expense", status: "overdue", amount: 300, due_date: "2026-01-20" },
    { movement: "investment", status: "pending", amount: 500, due_date: "2026-02-15" },
  ] as unknown as TransactionRow[];
  const r = calcularProjecao({ saldoContas: 1000, transacoes: tx, fimDoMesIso: "2026-02-28" });
  assert.equal(r.entradasPrevistas, 4597);
  assert.equal(r.saidasPrevistas, 2600, "1800 + 300 + 500");
  assert.equal(r.projetado, 2997, "1000 + 4597 - 2600");
}
{
  const tx = [
    { movement: "expense", status: "pending", amount: 7091, due_date: "2026-02-10" },
  ] as unknown as TransactionRow[];
  const r = calcularProjecao({ saldoContas: 1000, transacoes: tx, fimDoMesIso: "2026-02-28" });
  assert.equal(r.projetado, -6091, "não faz clamp");
}

// --- progressoDivida / progressoAgregado ---
assert.equal(progressoDivida({ total_amount: 1000, remaining_amount: 250 }), 0.75);
assert.equal(progressoDivida({ total_amount: 1000, remaining_amount: 0 }), 1);
assert.equal(progressoDivida({ total_amount: 0, remaining_amount: 0 }), 0, "sem NaN");
assert.equal(progressoDivida({ total_amount: 1000, remaining_amount: 1200 }), 0, "juros nao vira negativo");

{
  const dv = [
    { grupo: "consignado", total_amount: 22000, remaining_amount: 20000 },
    { grupo: "consignado", total_amount: 3000, remaining_amount: 0 },
    { grupo: "serasa", total_amount: 9500, remaining_amount: 9500 },
  ] as unknown as DebtRow[];
  const r = progressoAgregado(dv);
  assert.equal(r.porGrupo.consignado.total, 25000);
  assert.equal(r.porGrupo.consignado.restante, 20000);
  assert.equal(r.porGrupo.consignado.pago, 5000);
  assert.equal(r.porGrupo.serasa.pago, 0);
  assert.equal(r.porGrupo.fgts.total, 0, "grupo sem dívida");
  assert.equal(r.geral.total, 34500);
  assert.equal(r.geral.restante, 29500);
  assert.equal(r.geral.pago, 5000);
}

console.log("financas.check: OK");
