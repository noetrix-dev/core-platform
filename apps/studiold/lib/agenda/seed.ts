// Fixtures da agenda. Em produção os dados vêm de lib/agenda/load (Supabase);
// isto sobrou como fallback de `initState` e alimenta só o `pnpm --filter
// studiold check`. Os dados fixos (horário, almoço, 13 serviços) são os reais
// da StudiOLD; clientes e movimento do dia são sintéticos.

import type {
  AgendaData,
  Agendamento,
  Cliente,
  HorarioFuncionamento,
  Servico,
} from "./types";
import { isoAt } from "./time.ts";

export const SERVICOS: Servico[] = [
  { id: "svc-corte", nome: "Corte", duracao_minutos: 30, preco: 55 },
  { id: "svc-barba", nome: "Barba", duracao_minutos: 30, preco: 55 },
  { id: "svc-corte-barba", nome: "Corte + Barba", duracao_minutos: 60, preco: 100 },
  { id: "svc-infantil", nome: "Corte Infantil", duracao_minutos: 30, preco: 60 },
  { id: "svc-progressiva", nome: "Progressiva", duracao_minutos: 90, preco: 120 },
  { id: "svc-hidratacao", nome: "Hidratação", duracao_minutos: 30, preco: 35 },
  { id: "svc-sobrancelha", nome: "Sobrancelha", duracao_minutos: 15, preco: 20 },
  { id: "svc-mascara", nome: "Máscara Negra", duracao_minutos: 15, preco: 20 },
  { id: "svc-nariz-orelha", nome: "Depilação Nariz + Orelhas", duracao_minutos: 15, preco: 20 },
  { id: "svc-cb-sobrancelha", nome: "Corte + Barba + Sobrancelha", duracao_minutos: 75, preco: 115 },
  { id: "svc-cb-mascara", nome: "Corte + Barba + Máscara Negra", duracao_minutos: 75, preco: 115 },
  { id: "svc-cb-nariz", nome: "Corte + Barba + Nariz + Orelhas", duracao_minutos: 75, preco: 115 },
  { id: "svc-completo", nome: "StudiOLD Completo", duracao_minutos: 90, preco: 130 },
];

export const HORARIOS: HorarioFuncionamento[] = [
  { dia_semana: 0, aberto: false, hora_abertura: null, hora_fechamento: null },
  { dia_semana: 1, aberto: true, hora_abertura: "09:00", hora_fechamento: "17:00" },
  { dia_semana: 2, aberto: false, hora_abertura: null, hora_fechamento: null },
  { dia_semana: 3, aberto: true, hora_abertura: "09:00", hora_fechamento: "17:00" },
  { dia_semana: 4, aberto: true, hora_abertura: "09:00", hora_fechamento: "17:00" },
  { dia_semana: 5, aberto: true, hora_abertura: "09:00", hora_fechamento: "17:00" },
  { dia_semana: 6, aberto: true, hora_abertura: "08:00", hora_fechamento: "17:00" },
];

const CLIENTES: Cliente[] = [
  { id: "cli-01", nome: "Rodrigo Alves", telefone: "+55 11 99612-4477", genero: "masculino", total_visitas: 23, ultima_visita: iso_dias_atras(28), observacoes: "Máquina 1 nas laterais. Não gosta de conversa." },
  { id: "cli-02", nome: "Thiago Mendonça", telefone: "+55 11 98220-1183", genero: "masculino", total_visitas: 9, ultima_visita: iso_dias_atras(35) },
  { id: "cli-03", nome: "Bruno Cardoso", telefone: "+55 11 99145-8890", genero: "masculino", total_visitas: 4, ultima_visita: iso_dias_atras(52) },
  { id: "cli-04", nome: "Fernando Lima", telefone: "+55 11 97733-2019", genero: "masculino", total_visitas: 41, ultima_visita: iso_dias_atras(21), observacoes: "Barba: aparar, não raspar. Toalha quente." },
  { id: "cli-05", nome: "Diego Nunes", telefone: "+55 11 99881-7654", genero: "masculino", total_visitas: 17, ultima_visita: iso_dias_atras(30) },
  { id: "cli-06", nome: "Marcelo Pires", telefone: "+55 11 98404-5521", genero: "masculino", total_visitas: 6, ultima_visita: iso_dias_atras(44) },
  { id: "cli-07", nome: "André Barreto", telefone: "+55 11 99230-9987", genero: "masculino", total_visitas: 2, ultima_visita: iso_dias_atras(90) },
  { id: "cli-08", nome: "Henrique Salles", telefone: "+55 11 97112-6633", genero: "masculino", total_visitas: 12, ultima_visita: iso_dias_atras(26) },
  { id: "cli-09", nome: "Lucas Prado", telefone: "+55 11 99518-3300", genero: "masculino", total_visitas: 1 },
  { id: "cli-10", nome: "Gustavo Rocha", telefone: "+55 11 98877-1290", genero: "masculino", total_visitas: 8, ultima_visita: iso_dias_atras(33) },
  { id: "cli-11", nome: "Vinícius Teixeira", telefone: "+55 11 99604-4412", genero: "masculino", total_visitas: 5, ultima_visita: iso_dias_atras(60) },
  { id: "cli-12", nome: "Paulo Sérgio Farias", telefone: "+55 11 97255-8071", genero: "masculino", total_visitas: 19, ultima_visita: iso_dias_atras(24) },
  { id: "cli-13", nome: "Caio Figueiredo", telefone: "+55 11 99019-7745", genero: "masculino", total_visitas: 3, ultima_visita: iso_dias_atras(48) },
  { id: "cli-14", nome: "Igor Ramalho", telefone: "+55 11 98663-2204", genero: "masculino", total_visitas: 7, ultima_visita: iso_dias_atras(38) },
  { id: "cli-15", nome: "Renato Aguiar", telefone: "+55 11 99347-1166", genero: "masculino", total_visitas: 14, ultima_visita: iso_dias_atras(29) },
  { id: "cli-16", nome: "Sandro Belarmino", telefone: "+55 11 97880-9033", genero: "masculino", total_visitas: 11, ultima_visita: iso_dias_atras(31), observacoes: "Filho do Sr. Belarmino — corte infantil, 6 anos." },
];

function iso_dias_atras(dias: number): string {
  return new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
}

/** Movimento do dia, ancorado no horário de funcionamento (09–17). */
function agendamentosDoDia(dayKey: string): Agendamento[] {
  const at = (min: number) => isoAt(dayKey, min);
  return [
    { id: "ag-01", cliente_id: "cli-01", servico_id: "svc-corte", inicio: at(540), duracao_minutos: 30, status: "concluido", origem: "whatsapp" },
    { id: "ag-02", cliente_id: "cli-04", servico_id: "svc-corte-barba", inicio: at(570), duracao_minutos: 60, status: "concluido", origem: "whatsapp" },
    { id: "ag-03", cliente_id: "cli-07", servico_id: "svc-corte", inicio: at(630), duracao_minutos: 30, status: "nao_compareceu", origem: "whatsapp" },
    { id: "ag-04", cliente_id: "cli-12", servico_id: "svc-barba", inicio: at(660), duracao_minutos: 30, status: "concluido", origem: "walkin" },
    { id: "ag-05", cliente_id: "cli-15", servico_id: "svc-cb-sobrancelha", inicio: at(750), duracao_minutos: 75, status: "confirmado", origem: "whatsapp", em_atendimento: true, observacoes: "Pediu para deixar a franja mais longa.", cortesia_id: "cor-cerveja", cortesia_nome: "Cerveja" },
    { id: "ag-06", cliente_id: "cli-02", servico_id: "svc-corte", inicio: at(810), duracao_minutos: 30, status: "confirmado", origem: "whatsapp", cortesia_id: "cor-cafe", cortesia_nome: "Café" },
    { id: "ag-07", cliente_id: "cli-09", servico_id: "svc-sobrancelha", inicio: at(840), duracao_minutos: 15, status: "agendado", origem: "whatsapp", observacoes: "Aguardando confirmação pelo WhatsApp." },
    { id: "ag-08", cliente_id: "cli-05", servico_id: "svc-progressiva", inicio: at(900), duracao_minutos: 90, status: "agendado", origem: "whatsapp" },
    { id: "ag-09", cliente_id: "cli-16", servico_id: "svc-infantil", inicio: at(990), duracao_minutos: 30, status: "confirmado", origem: "whatsapp" },
  ];
}

export function buildSeed(dayKey: string): AgendaData {
  const now = Date.now();
  return {
    tenant: { slug: "barbearia_001", nome: "StudiOLD", whatsapp_status: "conectado" },
    clientes: CLIENTES,
    servicos: SERVICOS,
    cortesias: [
      { id: "cor-agua", nome: "Água", ativo: true, quantidade_estoque: 24 },
      { id: "cor-cafe", nome: "Café", ativo: true, quantidade_estoque: 40 },
      { id: "cor-refri", nome: "Refrigerante", ativo: true, quantidade_estoque: 12 },
      { id: "cor-cerveja", nome: "Cerveja", ativo: true, quantidade_estoque: 8 },
      { id: "cor-suco", nome: "Suco", ativo: true, quantidade_estoque: 0 },
      { id: "cor-cha", nome: "Chá", ativo: false, quantidade_estoque: 5 },
    ],
    horarios: HORARIOS,
    bloqueios_fixos: [
      { id: "blf-almoco", descricao: "Almoço", dia_semana: null, hora_inicio: "11:30", hora_fim: "12:30", tipo: "suave" },
    ],
    bloqueios_pontuais: [],
    agendamentos: agendamentosDoDia(dayKey),
    fila: [
      { id: "fila-1", cliente_id: "cli-03", data_desejada: dayKey, servico_id: "svc-corte", status: "aguardando", posicao: 1 },
      { id: "fila-2", cliente_id: "cli-11", data_desejada: dayKey, servico_id: "svc-corte-barba", status: "aguardando", posicao: 2 },
      { id: "fila-3", cliente_id: "cli-14", data_desejada: dayKey, servico_id: "svc-barba", status: "aguardando", posicao: 3 },
    ],
    encaixes: [
      { id: "enc-1", cliente_id: "cli-08", servico_id: "svc-corte", horario_solicitado: isoAt(dayKey, 825), status: "pendente", expira_em: new Date(now + 8 * 60_000).toISOString() },
      { id: "enc-2", cliente_id: "cli-13", servico_id: "svc-mascara", horario_solicitado: isoAt(dayKey, 960), status: "pendente", expira_em: new Date(now + 21 * 60_000).toISOString() },
    ],
  };
}
