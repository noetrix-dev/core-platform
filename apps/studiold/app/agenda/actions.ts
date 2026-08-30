"use server";

// Server Actions da agenda. Cada uma persiste UMA mutação no schema do tenant.
// O reducer continua puro — o cliente faz o update otimista e chama estas.
//
// As operações de fila (cancelar→avisar, notificar, confirmar, encaixe) chamam
// funções plpgsql com SELECT ... FOR UPDATE (ver docs/agenda-rpc.sql). Enquanto
// a migration não for aplicada, elas retornam erro e o cliente recarrega.

import { tenantDb } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import type { StatusAgendamento } from "@/lib/agenda/types";

type R = { ok: true } | { ok: false; error: string };

const TZ_OFFSET = "-03:00"; // ponytail: SP sem horário de verão

function instante(dayKey: string, minutos: number): string {
  const hh = String(Math.floor(minutos / 60)).padStart(2, "0");
  const mm = String(minutos % 60).padStart(2, "0");
  return new Date(`${dayKey}T${hh}:${mm}:00${TZ_OFFSET}`).toISOString();
}

function falha(e: { message: string } | null, ctx: string): R {
  return { ok: false, error: `${ctx}: ${e?.message ?? "erro desconhecido"}` };
}

export async function mudarStatus(
  agId: string,
  status: StatusAgendamento,
): Promise<R> {
  await requireUser();
  const { error } = await tenantDb()
    .from("agendamentos")
    .update({ status, atualizado_em: new Date().toISOString() })
    .eq("id", agId);
  return error ? falha(error, "mudarStatus") : { ok: true };
}

export async function recusarEncaixe(encId: string): Promise<R> {
  await requireUser();
  const { error } = await tenantDb()
    .from("pedidos_encaixe")
    .update({ status: "recusado", atualizado_em: new Date().toISOString() })
    .eq("id", encId);
  return error ? falha(error, "recusarEncaixe") : { ok: true };
}

export async function bloquear(p: {
  dataKey: string;
  horaInicio: string;
  horaFim: string;
  descricao: string;
}): Promise<R> {
  await requireUser();
  const { error } = await tenantDb()
    .from("bloqueios_pontuais")
    .insert({
      data: p.dataKey,
      hora_inicio: p.horaInicio,
      hora_fim: p.horaFim,
      descricao: p.descricao || null,
    });
  return error ? falha(error, "bloquear") : { ok: true };
}

export async function agendar(p: {
  nome: string;
  telefone: string;
  clienteId?: string;
  servicoId: string;
  cortesiaId?: string;
  inicioMin: number;
  naCadeira?: boolean;
  dayKey: string;
}): Promise<R> {
  await requireUser();
  const db = tenantDb();

  let clienteId = p.clienteId;
  if (!clienteId) {
    const tel = p.telefone.trim();
    const achado = await db.from("clientes").select("id").eq("telefone", tel).maybeSingle();
    if (achado.error) return falha(achado.error, "agendar/cliente");
    if (achado.data) {
      clienteId = achado.data.id as string;
    } else {
      const novo = await db
        .from("clientes")
        .insert({ nome: p.nome.trim(), telefone: tel })
        .select("id")
        .single();
      if (novo.error) return falha(novo.error, "agendar/novoCliente");
      clienteId = novo.data.id as string;
    }
  }

  const svc = await db
    .from("servicos")
    .select("duracao_minutos")
    .eq("id", p.servicoId)
    .single();
  if (svc.error) return falha(svc.error, "agendar/servico");
  const dur = (svc.data.duracao_minutos as number) ?? 30;
  const dataHora = instante(p.dayKey, p.inicioMin);

  // claim do slot (data_hora é unique) e insere o agendamento
  const slot = await db
    .from("slots")
    .upsert({ data_hora: dataHora, duracao_minutos: dur, disponivel: false }, { onConflict: "data_hora" })
    .select("id")
    .single();
  if (slot.error) return falha(slot.error, "agendar/slot");

  const cortesiaId = /^[0-9a-f-]{36}$/i.test(p.cortesiaId ?? "")
    ? p.cortesiaId!
    : null;

  const ins = await db.from("agendamentos").insert({
    slot_id: slot.data.id as string,
    cliente_id: clienteId,
    servico_id: p.servicoId,
    duracao_minutos: dur,
    status: p.naCadeira ? "confirmado" : "agendado",
    cortesia_id: cortesiaId,
  });
  return ins.error ? falha(ins.error, "agendar/agendamento") : { ok: true };
}

// --- fila / encaixe: FOR UPDATE dentro de função plpgsql -----------------

export async function cancelar(agId: string): Promise<R> {
  await requireUser();
  const { error } = await tenantDb().rpc("fn_cancelar_agendamento", {
    p_agendamento_id: agId,
  });
  return error ? falha(error, "cancelar") : { ok: true };
}

export async function notificarFila(filaId: string): Promise<R> {
  await requireUser();
  const { error } = await tenantDb().rpc("fn_notificar_fila", { p_fila_id: filaId });
  return error ? falha(error, "notificarFila") : { ok: true };
}

export async function confirmarFila(
  filaId: string,
  inicioMin: number,
  dayKey: string,
): Promise<R> {
  await requireUser();
  const { error } = await tenantDb().rpc("fn_confirmar_fila", {
    p_fila_id: filaId,
    p_inicio: instante(dayKey, inicioMin),
  });
  return error ? falha(error, "confirmarFila") : { ok: true };
}

export async function aceitarEncaixe(encId: string): Promise<R> {
  await requireUser();
  const { error } = await tenantDb().rpc("fn_aceitar_encaixe", {
    p_pedido_id: encId,
  });
  return error ? falha(error, "aceitarEncaixe") : { ok: true };
}

type ItemRPC = {
  tipo: "servico" | "produto";
  refId: string;
  descricao: string;
  quantidade: number;
  precoUnitario: number;
};

export async function concluirAtendimento(
  agId: string,
  valor: number,
  forma: "pix" | "cartao_debito" | "cartao_credito" | "dinheiro",
  cortesiaId?: string,
  itens: ItemRPC[] = [],
): Promise<R> {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(agId)) {
    return { ok: false, error: "id de agendamento inválido" };
  }
  if (!Number.isFinite(valor) || valor < 0) {
    return { ok: false, error: "valor inválido" };
  }
  if (!["pix", "cartao_debito", "cartao_credito", "dinheiro"].includes(forma)) {
    return { ok: false, error: "forma de pagamento inválida" };
  }
  const cor = /^[0-9a-f-]{36}$/i.test(cortesiaId ?? "") ? cortesiaId! : null;

  const pItens = [];
  for (const it of itens) {
    if (it.tipo !== "servico" && it.tipo !== "produto") {
      return { ok: false, error: "item com tipo inválido" };
    }
    if (!/^[0-9a-f-]{36}$/i.test(it.refId)) {
      return { ok: false, error: "item com referência inválida" };
    }
    if (!Number.isInteger(it.quantidade) || it.quantidade < 1 || it.quantidade > 99) {
      return { ok: false, error: "quantidade de item inválida" };
    }
    if (!Number.isFinite(it.precoUnitario) || it.precoUnitario < 0) {
      return { ok: false, error: "preço de item inválido" };
    }
    pItens.push({
      tipo: it.tipo,
      ref_id: it.refId,
      descricao: (it.descricao ?? "").slice(0, 120),
      quantidade: it.quantidade,
      preco_unitario: it.precoUnitario,
    });
  }

  const { error } = await tenantDb().rpc("fn_concluir_atendimento", {
    p_agendamento_id: agId,
    p_valor: valor,
    p_forma_pagamento: forma,
    p_cortesia_id: cor,
    p_itens: pItens,
  });
  return error ? falha(error, "concluirAtendimento") : { ok: true };
}
