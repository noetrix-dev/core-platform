import assert from "node:assert/strict";
import { somaMesesISO, fimDoMesISO } from "./datas.ts";
import { expandirParcelas } from "./lancamentos/parcelas.ts";
import { gerarTransacoesDoMes } from "./lancamentos/recorrentes.ts";

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

console.log("financas.check: OK");
