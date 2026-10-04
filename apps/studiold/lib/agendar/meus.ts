// Leitura dos agendamentos do cliente da sessão de /agendar (Spec C).
// Só servidor (service-role). Todo filtro é por cliente_id vindo do cookie
// assinado — nunca por id que a UI mandou sem esse filtro junto.
import "server-only";
import { tenantDb } from "@/lib/supabase/server";
import {
  ehUuid,
  partesSaoPaulo,
  separarAgendamentos,
  type ItemAgendamento,
} from "./formato.ts";

export type AgendamentoDoCliente = {
  id: string;
  status: string;
  inicio: string;
  data: string;
  hora: string;
  servicoIds: string[];
};

type Linha = {
  id: string;
  status: string;
  valor_total: number | string | null;
  slots: { data_hora: string } | { data_hora: string }[];
  agendamento_servicos:
    | { ordem: number; servico_id: string; servicos: { nome: string } | { nome: string }[] | null }[]
    | null;
};

const SELECT =
  "id, status, valor_total, slots!inner(data_hora), agendamento_servicos(ordem, servico_id, servicos(nome))";

function um<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function itensOrdenados(l: Linha) {
  return [...(l.agendamento_servicos ?? [])].sort((a, b) => a.ordem - b.ordem);
}

function paraItem(l: Linha): ItemAgendamento {
  const inicio = um(l.slots)?.data_hora ?? "";
  const { data, hora } = partesSaoPaulo(inicio);
  const itens = itensOrdenados(l);
  return {
    id: l.id,
    inicio,
    data,
    hora,
    status: l.status,
    valorTotal: Number(l.valor_total ?? 0),
    // ponytail: agendamento sem linhas em agendamento_servicos (ex.: criado fora das RPCs v2) mostra "Serviço"; join no servico_id principal se aparecer na prática.
    servicos: itens.length ? itens.map((i) => um(i.servicos)?.nome ?? "Serviço") : ["Serviço"],
  };
}

// ponytail: últimos 50 por criado_em (PostgREST não ordena o pai por coluna
// embutida); cliente com mais que isso perde os mais antigos, que já ficariam
// fora dos 10 anteriores exibidos.
export async function carregarMeusAgendamentos(
  clienteId: string,
): Promise<{ futuros: ItemAgendamento[]; passados: ItemAgendamento[] } | null> {
  const r = await tenantDb()
    .from("agendamentos")
    .select(SELECT)
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: false })
    .limit(50);
  if (r.error) {
    console.error("[agendar/meus/lista]", r.error.message);
    return null;
  }
  return separarAgendamentos(((r.data ?? []) as Linha[]).map(paraItem), Date.now());
}

export async function lerAgendamentoDoCliente(
  clienteId: string,
  id: string,
): Promise<AgendamentoDoCliente | null> {
  if (!ehUuid(id)) return null;
  const r = await tenantDb()
    .from("agendamentos")
    .select(SELECT)
    .eq("id", id)
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (r.error) {
    console.error("[agendar/meus/um]", r.error.message);
    return null;
  }
  if (!r.data) return null;
  const l = r.data as Linha;
  const item = paraItem(l);
  return {
    id: item.id,
    status: item.status,
    inicio: item.inicio,
    data: item.data,
    hora: item.hora,
    servicoIds: itensOrdenados(l).map((i) => i.servico_id),
  };
}

export async function nomeDoCliente(clienteId: string): Promise<string | null> {
  const r = await tenantDb()
    .from("clientes")
    .select("nome")
    .eq("id", clienteId)
    .eq("ativo", true)
    .maybeSingle();
  if (r.error) {
    console.error("[agendar/meus/nome]", r.error.message);
    return null;
  }
  return (r.data as { nome: string } | null)?.nome ?? null;
}
