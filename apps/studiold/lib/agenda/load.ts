// Camada de leitura da agenda. Roda no servidor, lê o schema do tenant e
// devolve o mesmo AgendaData que o mock devolvia — daí pra frente (timeline,
// reducer, componentes) nada muda.

import "server-only";
import { tenantDb, TENANT_SCHEMA } from "@/lib/supabase/server";
import type {
  AgendaData,
  Agendamento,
  Cliente,
  FilaEspera,
  PedidoEncaixe,
  StatusAgendamento,
  StatusEncaixe,
  StatusFila,
  WhatsappStatus,
} from "./types";

// ponytail: offset fixo de São Paulo (Brasil não tem mais horário de verão
// desde 2019). Revisar se algum tenant cair em outro fuso.
const TZ = "America/Sao_Paulo";
const TZ_OFFSET = "-03:00";

/** instante UTC -> "YYYY-MM-DDTHH:mm:ss" no relógio de parede de SP, sem offset,
 *  para `new Date(x).getHours()` devolver a hora local do tenant em qualquer
 *  servidor (o resto do código já assume isso). */
function wallClock(instant: string): string {
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(instant));
  return p.replace(" ", "T");
}

function diaRange(dayKey: string): { ini: string; fim: string } {
  const ini = new Date(`${dayKey}T00:00:00${TZ_OFFSET}`);
  return {
    ini: ini.toISOString(),
    fim: new Date(ini.getTime() + 86_400_000).toISOString(),
  };
}

type Row = Record<string, unknown>;

function must<T>(res: { data: T | null; error: { message: string } | null }, o: string): T {
  if (res.error) throw new Error(`agenda/load ${o}: ${res.error.message}`);
  return res.data as T;
}

export async function loadAgendaData(dayKey: string): Promise<AgendaData> {
  const db = tenantDb();
  const { ini, fim } = diaRange(dayKey);

  const [
    tenantRes,
    clientesRes,
    servicosRes,
    horariosRes,
    bfRes,
    bpRes,
    agsRes,
    filaRes,
    encRes,
    atendRes,
    cortesiasRes,
  ] = await Promise.all([
    db.schema("public").from("tenants").select("nome, whatsapp_status").eq("slug", TENANT_SCHEMA).maybeSingle(),
    db.from("clientes").select("id, nome, telefone, genero, observacoes").eq("ativo", true),
    db.from("servicos").select("id, nome, duracao_minutos, preco").eq("ativo", true).order("nome"),
    db.from("horarios_funcionamento").select("dia_semana, aberto, hora_abertura, hora_fechamento"),
    db.from("bloqueios_fixos").select("id, descricao, dia_semana, hora_inicio, hora_fim, tipo").eq("ativo", true),
    db.from("bloqueios_pontuais").select("id, descricao, data, hora_inicio, hora_fim").eq("ativo", true).eq("data", dayKey),
    db
      .from("agendamentos")
      .select(
        "id, cliente_id, servico_id, duracao_minutos, status, observacoes, cortesia_id, slots!inner(data_hora), cortesias(nome)",
      )
      .gte("slots.data_hora", ini)
      .lt("slots.data_hora", fim),
    db.from("fila_espera").select("id, cliente_id, data_desejada, servico_id, status, notificado_em, expira_em, posicao").eq("data_desejada", dayKey).order("posicao"),
    db
      .from("pedidos_encaixe")
      .select("id, cliente_id, servico_id, horario_solicitado, status, expira_em, agendamento_id")
      .gte("horario_solicitado", ini)
      .lt("horario_solicitado", fim),
    db.from("atendimentos").select("cliente_id, realizado_em"),
    db
      .from("cortesias")
      .select("id, nome, descricao, ativo, quantidade_estoque")
      .order("nome"),
  ]);

  const tenant = must(tenantRes, "tenants");
  const clientesRows = must(clientesRes, "clientes") as Row[];
  const servicosRows = must(servicosRes, "servicos") as Row[];
  const horariosRows = must(horariosRes, "horarios_funcionamento") as Row[];
  const bfRows = must(bfRes, "bloqueios_fixos") as Row[];
  const bpRows = must(bpRes, "bloqueios_pontuais") as Row[];
  const agsRows = must(agsRes, "agendamentos") as Row[];
  const filaRows = must(filaRes, "fila_espera") as Row[];
  const encRows = must(encRes, "pedidos_encaixe") as Row[];
  const atendRows = must(atendRes, "atendimentos") as Row[];
  const cortesiasRows = must(cortesiasRes, "cortesias") as Row[];

  // histórico do cliente derivado de `atendimentos`
  const hist = new Map<string, { total: number; ultima?: string }>();
  for (const a of atendRows) {
    const cid = a.cliente_id as string;
    const feito = a.realizado_em as string | null;
    const h = hist.get(cid) ?? { total: 0 };
    h.total += 1;
    if (feito && (!h.ultima || feito > h.ultima)) h.ultima = feito;
    hist.set(cid, h);
  }

  const clientes: Cliente[] = clientesRows.map((c) => {
    const h = hist.get(c.id as string);
    return {
      id: c.id as string,
      nome: c.nome as string,
      telefone: c.telefone as string,
      genero: (c.genero as Cliente["genero"]) ?? "nao_informado",
      observacoes: (c.observacoes as string) ?? undefined,
      total_visitas: h?.total ?? 0,
      ultima_visita: h?.ultima ? h.ultima.slice(0, 10) : undefined,
    };
  });

  const agendamentos: Agendamento[] = agsRows.map((a) => {
    const slot = a.slots as { data_hora: string } | { data_hora: string }[];
    const dataHora = Array.isArray(slot) ? slot[0].data_hora : slot.data_hora;
    const cort = a.cortesias as { nome: string } | { nome: string }[] | null;
    const cortesiaNome = Array.isArray(cort) ? cort[0]?.nome : cort?.nome;
    return {
      id: a.id as string,
      cliente_id: a.cliente_id as string,
      servico_id: a.servico_id as string,
      inicio: wallClock(dataHora),
      duracao_minutos: (a.duracao_minutos as number) ?? 30,
      status: a.status as StatusAgendamento,
      origem: "whatsapp",
      observacoes: (a.observacoes as string) ?? undefined,
      cortesia_id: (a.cortesia_id as string) ?? undefined,
      cortesia_nome: cortesiaNome ?? undefined,
    };
  });

  return {
    tenant: {
      slug: TENANT_SCHEMA,
      nome: (tenant?.nome as string) ?? "StudiOLD",
      whatsapp_status: ((tenant?.whatsapp_status as WhatsappStatus) ?? "desconectado"),
    },
    clientes,
    servicos: servicosRows.map((s) => ({
      id: s.id as string,
      nome: s.nome as string,
      duracao_minutos: s.duracao_minutos as number,
      preco: Number(s.preco),
    })),
    cortesias: cortesiasRows.map((c) => ({
      id: c.id as string,
      nome: c.nome as string,
      descricao: (c.descricao as string) ?? undefined,
      ativo: c.ativo as boolean,
      quantidade_estoque: (c.quantidade_estoque as number) ?? 0,
    })),
    horarios: horariosRows.map((h) => ({
      dia_semana: h.dia_semana as number,
      aberto: h.aberto as boolean,
      hora_abertura: (h.hora_abertura as string)?.slice(0, 5) ?? null,
      hora_fechamento: (h.hora_fechamento as string)?.slice(0, 5) ?? null,
    })),
    bloqueios_fixos: bfRows.map((b) => ({
      id: b.id as string,
      descricao: b.descricao as string,
      dia_semana: (b.dia_semana as number) ?? null,
      hora_inicio: (b.hora_inicio as string).slice(0, 5),
      hora_fim: (b.hora_fim as string).slice(0, 5),
      tipo: b.tipo as "suave" | "rigido",
    })),
    bloqueios_pontuais: bpRows.map((b) => ({
      id: b.id as string,
      descricao: (b.descricao as string) ?? undefined,
      data: b.data as string,
      hora_inicio: (b.hora_inicio as string).slice(0, 5),
      hora_fim: (b.hora_fim as string).slice(0, 5),
    })),
    agendamentos,
    fila: filaRows.map((f) => ({
      id: f.id as string,
      cliente_id: f.cliente_id as string,
      data_desejada: f.data_desejada as string,
      servico_id: (f.servico_id as string) ?? undefined,
      status: f.status as StatusFila,
      notificado_em: (f.notificado_em as string) ?? undefined,
      expira_em: (f.expira_em as string) ?? undefined,
      posicao: f.posicao as number,
    })) satisfies FilaEspera[],
    encaixes: encRows.map((e) => ({
      id: e.id as string,
      cliente_id: e.cliente_id as string,
      servico_id: e.servico_id as string,
      horario_solicitado: wallClock(e.horario_solicitado as string),
      status: e.status as StatusEncaixe,
      expira_em: e.expira_em as string,
      agendamento_id: (e.agendamento_id as string) ?? undefined,
    })) satisfies PedidoEncaixe[],
  };
}
