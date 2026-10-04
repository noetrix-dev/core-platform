"use server";

// Notificações do painel (sino no Topbar). Painel da equipe: toda action
// começa com requireUser(), igual a app/agenda/actions.ts. A tabela
// barbearia_001.notificacoes é preenchida por trigger em agendamento_eventos
// (docs/migrations-draft/2026-10-04-notificacoes.sql). Sem a migration, as
// actions logam o erro e o sino degrada (sem badge / mensagem de erro).
// Spec: docs/superpowers/specs/2026-10-04-notificacoes-painel-design.md

import { requireUser } from "@/lib/supabase/auth";
import { tenantDb } from "@/lib/supabase/server";
import { partesSaoPaulo } from "@/lib/agendar/formato";
import type { CanalNotificacao, TipoNotificacao } from "@/lib/notificacoes/formato";

export type ItemNotificacao = {
  id: string;
  tipo: TipoNotificacao;
  canal: CanalNotificacao;
  cliente: string | null; // null = cliente apagado
  servicos: string[];
  data: string | null; // YYYY-MM-DD (São Paulo); null = horário removido
  hora: string | null; // HH:MM (São Paulo)
  anterior: { data: string; hora: string } | null; // remarcação
  criadoEm: string;
  lida: boolean;
};

const LIMITE = 30;
const JANELA_MS = 24 * 60 * 60_000;
const MAX_IDS = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Um<T> = T | T[] | null;
type Linha = {
  id: string;
  tipo: TipoNotificacao;
  canal: CanalNotificacao;
  lida: boolean;
  criado_em: string;
  inicio_anterior: string | null;
  clientes: Um<{ nome: string }>;
  agendamentos: Um<{
    slots: Um<{ data_hora: string }>;
    agendamento_servicos: { ordem: number; servicos: Um<{ nome: string }> }[] | null;
  }>;
};

const SELECT =
  "id, tipo, canal, lida, criado_em, inicio_anterior, clientes(nome), agendamentos(slots(data_hora), agendamento_servicos(ordem, servicos(nome)))";

function um<T>(v: Um<T> | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function paraItem(l: Linha): ItemNotificacao {
  const ag = um(l.agendamentos);
  const inicio = um(ag?.slots)?.data_hora ?? null;
  const quando = inicio ? partesSaoPaulo(inicio) : null;
  const servicos = [...(ag?.agendamento_servicos ?? [])]
    .sort((a, b) => a.ordem - b.ordem)
    .map((s) => um(s.servicos)?.nome ?? "Serviço");
  return {
    id: l.id,
    tipo: l.tipo,
    canal: l.canal,
    cliente: um(l.clientes)?.nome ?? null,
    servicos,
    data: quando?.data ?? null,
    hora: quando?.hora ?? null,
    anterior: l.inicio_anterior ? partesSaoPaulo(l.inicio_anterior) : null,
    criadoEm: l.criado_em,
    lida: l.lida,
  };
}

export async function contarNaoLidas(): Promise<number | null> {
  await requireUser();
  const r = await tenantDb()
    .from("notificacoes")
    .select("id", { count: "exact", head: true })
    .eq("lida", false);
  if (r.error) {
    console.error("[notificacoes/contar]", r.error.message);
    return null;
  }
  return r.count ?? 0;
}

// Não lidas de qualquer data + lidas das últimas 24h, mais novas primeiro.
export async function listarNotificacoes(): Promise<{ ok: true; itens: ItemNotificacao[] } | { ok: false }> {
  await requireUser();
  const desde = new Date(Date.now() - JANELA_MS).toISOString();
  const r = await tenantDb()
    .from("notificacoes")
    .select(SELECT)
    .or(`lida.eq.false,criado_em.gte.${desde}`)
    .order("criado_em", { ascending: false })
    .limit(LIMITE);
  if (r.error) {
    console.error("[notificacoes/listar]", r.error.message);
    return { ok: false };
  }
  return { ok: true, itens: ((r.data ?? []) as Linha[]).map(paraItem) };
}

// Marca como lidas só as notificações que foram mostradas (ids da lista).
export async function marcarLidas(ids: string[]): Promise<void> {
  await requireUser();
  const validos = Array.isArray(ids)
    ? ids.filter((id) => typeof id === "string" && UUID.test(id)).slice(0, MAX_IDS)
    : [];
  if (validos.length === 0) return;
  const r = await tenantDb().from("notificacoes").update({ lida: true }).in("id", validos);
  if (r.error) console.error("[notificacoes/marcar]", r.error.message);
}
