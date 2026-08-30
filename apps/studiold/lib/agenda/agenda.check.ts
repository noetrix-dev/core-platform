// Check de fumaça da lógica pura da agenda. Sem framework.
// Rodar:  node --experimental-strip-types lib/agenda/agenda.check.ts
// (ou `pnpm --filter studiold check`)

import assert from "node:assert/strict";
import { initState, reducer } from "./reducer.ts";
import { buildTimeline, vagasLivres } from "./timeline.ts";
import { hmToMin, minToHm } from "./time.ts";
import { resumirAtendimentos, visitasPorCliente } from "../clientes/resumo.ts";
import { parsePrecoBRL } from "../dinheiro.ts";
import { normalizarTelefone } from "../clientes/telefone.ts";
import { somaItens, type ItemPagamento } from "./pagamento.ts";

const DIA = "2026-08-26"; // quarta-feira, StudiOLD aberta 09–17

// --- timeline: vãos e bloqueio de almoço --------------------------------
{
  const { data } = initState(DIA);
  const { itens, janela } = buildTimeline(data, DIA, 770);
  assert.equal(janela.aberto, true);
  assert.ok(itens.some((i) => i.kind === "ficha"), "tem fichas");
  assert.ok(itens.some((i) => i.kind === "vao"), "tem ao menos um vão");
  const almoco = itens.find((i) => i.kind === "bloqueio");
  assert.ok(almoco && almoco.kind === "bloqueio", "tem bloqueio de almoço");
  assert.equal(almoco.tipo, "suave");
  assert.equal(almoco.inicioMin, hmToMin("11:30"));
  assert.ok(itens.some((i) => i.kind === "agora"), "insere marcador do agora");
  // itens em ordem crescente de horário
  const times = itens.map((i) => i.inicioMin);
  assert.deepEqual(times, [...times].sort((a, b) => a - b), "ordem cronológica");
}

// --- cancelar abre vaga e avisa o topo da fila -------------------------
{
  let s = initState(DIA);
  const antes = s.data.fila.find((f) => f.posicao === 1)!;
  assert.equal(antes.status, "aguardando");
  s = reducer(s, { type: "CANCELAR", agId: "ag-06" });
  const ag = s.data.agendamentos.find((a) => a.id === "ag-06")!;
  assert.equal(ag.status, "cancelado");
  const fila1 = s.data.fila.find((f) => f.posicao === 1)!;
  assert.equal(fila1.status, "notificado", "topo da fila foi avisado");
  assert.ok(fila1.expira_em, "janela de expiração definida");
  assert.match(s.aviso ?? "", /Vaga aberta/);
}

// --- aceitar encaixe cria agendamento --------------------------------
{
  let s = initState(DIA);
  const n0 = s.data.agendamentos.length;
  s = reducer(s, { type: "ACEITAR_ENCAIXE", encId: "enc-1" });
  assert.equal(s.data.agendamentos.length, n0 + 1);
  const enc = s.data.encaixes.find((e) => e.id === "enc-1")!;
  assert.equal(enc.status, "confirmado");
  assert.ok(enc.agendamento_id, "encaixe aponta para o agendamento criado");
}

// --- agendar cliente novo cadastra o cliente ------------------------
{
  let s = initState(DIA);
  const c0 = s.data.clientes.length;
  const vaga = vagasLivres(s.data, DIA, 30)[0];
  s = reducer(s, {
    type: "AGENDAR",
    origem: "walkin",
    nome: "Fulano de Teste",
    telefone: "+55 11 90000-1234",
    servicoId: "svc-corte",
    inicioMin: vaga,
  });
  assert.equal(s.data.clientes.length, c0 + 1, "cliente novo cadastrado");
}

// --- AGENDAR não mexe mais no estoque de cortesia ---------------------
{
  let s = initState(DIA);
  const cor = s.data.cortesias.find((c) => c.quantidade_estoque > 0)!;
  const estoque0 = cor.quantidade_estoque;
  const vaga = vagasLivres(s.data, DIA, 30)[0];
  s = reducer(s, {
    type: "AGENDAR",
    origem: "whatsapp",
    nome: "Teste Cortesia",
    telefone: "+55 11 90000-9999",
    servicoId: "svc-corte",
    cortesiaId: cor.id,
    inicioMin: vaga,
  });
  const corDepois = s.data.cortesias.find((c) => c.id === cor.id)!;
  assert.equal(
    corDepois.quantidade_estoque,
    estoque0,
    "AGENDAR não baixa estoque (a baixa é na conclusão)",
  );
}

// --- CONCLUIR_PAGAMENTO: status, cadeira, estoque -------------------
{
  let s = initState(DIA);
  // ag-05 está em atendimento no seed, com cortesia cor-cerveja
  const cerveja0 = s.data.cortesias.find((c) => c.id === "cor-cerveja")!
    .quantidade_estoque;
  s = reducer(s, {
    type: "CONCLUIR_PAGAMENTO",
    agId: "ag-05",
    valor: 115,
    forma: "pix",
    cortesiaId: "cor-cerveja",
    itens: [],
  });
  const ag = s.data.agendamentos.find((a) => a.id === "ag-05")!;
  assert.equal(ag.status, "concluido");
  assert.equal(ag.em_atendimento, false, "sai da cadeira ao concluir");
  const cerveja1 = s.data.cortesias.find((c) => c.id === "cor-cerveja")!
    .quantidade_estoque;
  assert.equal(cerveja1, cerveja0 - 1, "baixa 1 na cortesia servida");
  assert.match(s.aviso ?? "", /conclu/i);
}

// --- CONCLUIR_PAGAMENTO sem cortesia não mexe no estoque -----------
{
  let s = initState(DIA);
  const soma0 = s.data.cortesias.reduce((n, c) => n + c.quantidade_estoque, 0);
  s = reducer(s, {
    type: "CONCLUIR_PAGAMENTO",
    agId: "ag-05",
    valor: 100,
    forma: "dinheiro",
    itens: [],
  });
  const soma1 = s.data.cortesias.reduce((n, c) => n + c.quantidade_estoque, 0);
  assert.equal(soma1, soma0, "sem cortesia, estoque intacto");
  assert.equal(
    s.data.agendamentos.find((a) => a.id === "ag-05")!.status,
    "concluido",
  );
}

// --- CONCLUIR_PAGAMENTO baixa estoque de produto (soma + piso) ------
{
  const s0 = initState(DIA);
  const agId = s0.data.agendamentos.find((a) => a.status === "agendado")!.id; // ag-07
  const s1 = reducer(s0, {
    type: "CONCLUIR_PAGAMENTO",
    agId,
    valor: 85,
    forma: "dinheiro",
    itens: [
      { tipo: "produto", refId: "prod-1", descricao: "Pomada", quantidade: 2, precoUnitario: 30 },
      { tipo: "produto", refId: "prod-1", descricao: "Pomada", quantidade: 1, precoUnitario: 30 },
      { tipo: "produto", refId: "prod-2", descricao: "Cera", quantidade: 3, precoUnitario: 25 },
    ],
  });
  const p1 = s1.data.produtos.find((p) => p.id === "prod-1");
  const p2 = s1.data.produtos.find((p) => p.id === "prod-2");
  assert.equal(p1?.quantidade_estoque, 2, "prod-1: 5 - (2+1) = 2 (soma de linhas do mesmo produto)");
  assert.equal(p2?.quantidade_estoque, 0, "prod-2: 1 - 3 → piso em 0");
}

// --- expiração pelo TICK --------------------------------------------
{
  let s = initState(DIA);
  s = reducer(s, { type: "TICK", now: Date.now() + 60 * 60_000 });
  assert.ok(
    s.data.encaixes.every((e) => e.status !== "pendente"),
    "encaixes pendentes expiram após a janela",
  );
}

// --- time helpers -------------------------------------------------
assert.equal(minToHm(hmToMin("09:45")), "09:45");
assert.equal(hmToMin("00:00"), 0);
assert.equal(minToHm(1020), "17:00");

// --- resumo de cliente -------------------------------------------------
{
  const r0 = resumirAtendimentos([]);
  assert.equal(r0.total_gasto, 0);
  assert.equal(r0.total_visitas, 0);
  assert.equal(r0.ultima_visita, null);
  assert.equal(r0.servico_mais_frequente, null);
  assert.deepEqual(r0.historico, []);

  const rows = [
    { realizado_em: "2026-08-01T13:00:00.000Z", valor_cobrado: 55, forma_pagamento: "pix", servico_id: "s1", servico_nome: "Corte" },
    { realizado_em: "2026-08-20T13:00:00.000Z", valor_cobrado: 100, forma_pagamento: "dinheiro", servico_id: "s2", servico_nome: "Corte + Barba" },
    { realizado_em: "2026-08-10T13:00:00.000Z", valor_cobrado: 55, forma_pagamento: "pix", servico_id: "s1", servico_nome: "Corte" },
  ];
  const r = resumirAtendimentos(rows);
  assert.equal(r.total_gasto, 210);
  assert.equal(r.total_visitas, 3);
  assert.equal(r.ultima_visita, "2026-08-20T13:00:00.000Z");
  assert.equal(r.servico_mais_frequente, "Corte", "moda do serviço");
  assert.equal(r.historico.length, 3);
  assert.equal(r.historico[0].data, "2026-08-20T13:00:00.000Z", "histórico ordenado desc");
  assert.equal(r.historico[0].servico, "Corte + Barba");
  assert.equal(r.historico[2].data, "2026-08-01T13:00:00.000Z");

  const muitos = Array.from({ length: 12 }, (_, i) => ({
    realizado_em: `2026-08-${String(i + 1).padStart(2, "0")}T13:00:00.000Z`,
    valor_cobrado: 10,
    forma_pagamento: "pix",
    servico_id: "s1",
    servico_nome: "Corte",
  }));
  assert.equal(resumirAtendimentos(muitos).historico.length, 10, "histórico capado em 10");

  const vpc = visitasPorCliente([
    { cliente_id: "a", realizado_em: "2026-08-01T00:00:00.000Z" },
    { cliente_id: "a", realizado_em: "2026-08-05T00:00:00.000Z" },
    { cliente_id: "b", realizado_em: "2026-08-03T00:00:00.000Z" },
  ]);
  assert.equal(vpc.get("a")?.total, 2);
  assert.equal(vpc.get("a")?.ultima, "2026-08-05T00:00:00.000Z");
  assert.equal(vpc.get("b")?.total, 1);
  assert.equal(vpc.get("c"), undefined);
}

// --- parsePrecoBRL --------------------------------------------------
{
  assert.equal(parsePrecoBRL("55"), 55);
  assert.equal(parsePrecoBRL("55,50"), 55.5);
  assert.equal(parsePrecoBRL("1.234,56"), 1234.56);
  assert.equal(parsePrecoBRL("55.50"), 55.5, "ponto = decimal quando não há vírgula");
  assert.equal(parsePrecoBRL("  80,00  "), 80, "trim");
  assert.equal(parsePrecoBRL("10,999"), 11, "arredonda para 2 casas");
  assert.equal(parsePrecoBRL(""), null);
  assert.equal(parsePrecoBRL("abc"), null);
  assert.equal(parsePrecoBRL("-3"), null);
  assert.equal(parsePrecoBRL("R$ 55"), null, "sem limpeza de símbolo — entrada tem que ser numérica");
}

// --- normalizarTelefone --------------------------------------------------
{
  assert.equal(normalizarTelefone("11990001234"), "+5511990001234", "celular 11 dígitos sem código país");
  assert.equal(normalizarTelefone("(11) 99000-1234"), "+5511990001234", "tira máscara");
  assert.equal(normalizarTelefone("+55 11 99000-1234"), "+5511990001234", "já vem com +55");
  assert.equal(normalizarTelefone("5511990001234"), "+5511990001234", "13 dígitos com 55 na frente");
  assert.equal(normalizarTelefone("1132201234"), "+551132201234", "fixo 10 dígitos");
  assert.equal(normalizarTelefone("0800 123 4567"), null, "não é celular/fixo com DDD");
  assert.equal(normalizarTelefone("999"), null, "curto demais");
  assert.equal(normalizarTelefone(""), null, "vazio");
  assert.equal(normalizarTelefone("abc"), null, "sem dígitos");
}

// --- somaItens -----------------------------------------------------------
{
  const it = (over: Partial<ItemPagamento>): ItemPagamento => ({
    key: "k", tipo: "servico", refId: "r", descricao: "d",
    quantidade: 1, precoUnitario: 0, fixo: false, ...over,
  });
  assert.equal(somaItens([]), 0, "lista vazia");
  assert.equal(somaItens([it({ precoUnitario: 55 })]), 55, "um item qtd 1");
  assert.equal(
    somaItens([it({ quantidade: 3, precoUnitario: 12.5 })]),
    37.5,
    "qtd × preço",
  );
  assert.equal(
    somaItens([
      it({ fixo: true, precoUnitario: 55 }),
      it({ tipo: "produto", quantidade: 2, precoUnitario: 8.9 }),
    ]),
    72.8,
    "fixo + produto, 2 casas",
  );
  assert.equal(
    somaItens([it({ quantidade: 3, precoUnitario: 0.1 })]),
    0.3,
    "arredonda cada subtotal antes de somar (evita 0.30000000000000004)",
  );
}

console.log("agenda.check: OK");
