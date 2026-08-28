// Check de fumaça da lógica pura da agenda. Sem framework.
// Rodar:  node --experimental-strip-types lib/agenda/agenda.check.ts
// (ou `pnpm --filter studiold check`)

import assert from "node:assert/strict";
import { initState, reducer } from "./reducer.ts";
import { buildTimeline, vagasLivres } from "./timeline.ts";
import { hmToMin, minToHm } from "./time.ts";

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

console.log("agenda.check: OK");
