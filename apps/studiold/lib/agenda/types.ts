// Tipos da agenda — espelham o schema `barbearia_001` (infra/supabase/migrations).
// Campos em snake_case de propósito, para a troca por queries do Supabase client
// ser um recorte contido e não um rename espalhado.

export type Genero = "masculino" | "feminino" | "infantil" | "nao_informado";

export interface Cliente {
  id: string;
  nome: string;
  telefone: string;
  genero: Genero;
  observacoes?: string;
  // Derivados de `atendimentos` no banco real; aqui vêm prontos no seed.
  ultima_visita?: string; // ISO date
  total_visitas: number;
}

export interface Servico {
  id: string;
  nome: string;
  duracao_minutos: number;
  preco: number;
}

export interface Cortesia {
  id: string;
  nome: string;
  descricao?: string;
  ativo: boolean;
  quantidade_estoque: number;
}

export interface Produto {
  id: string;
  nome: string;
  descricao?: string;
  preco_venda: number;
  quantidade_estoque: number;
  ativo: boolean;
}

export interface HorarioFuncionamento {
  dia_semana: number; // 0=domingo … 6=sábado
  aberto: boolean;
  hora_abertura: string | null; // "09:00"
  hora_fechamento: string | null;
}

export interface BloqueioFixo {
  id: string;
  descricao: string;
  dia_semana: number | null; // null = todo dia
  hora_inicio: string;
  hora_fim: string;
  tipo: "suave" | "rigido";
}

export interface BloqueioPontual {
  id: string;
  descricao?: string;
  data: string; // ISO date "2026-08-28"
  hora_inicio: string;
  hora_fim: string;
}

// Fluxo: agendado → confirmado → concluido / nao_compareceu / cancelado
export type StatusAgendamento =
  | "agendado"
  | "confirmado"
  | "concluido"
  | "nao_compareceu"
  | "cancelado";

export type OrigemAgendamento = "whatsapp" | "walkin" | "encaixe";

export interface Agendamento {
  id: string;
  cliente_id: string;
  servico_id: string;
  inicio: string; // ISO datetime
  duracao_minutos: number;
  status: StatusAgendamento;
  origem: OrigemAgendamento;
  observacoes?: string;
  cortesia_id?: string;
  cortesia_nome?: string; // vem do join em load.ts
  // UI-only: cliente está na cadeira agora. No banco real seria uma linha em
  // `atendimentos` ou uma coluna nova — ponytail: sinal de tela, não de schema.
  em_atendimento?: boolean;
}

export type StatusFila =
  | "aguardando"
  | "notificado"
  | "confirmado"
  | "expirado"
  | "cancelado";

export interface FilaEspera {
  id: string;
  cliente_id: string;
  data_desejada: string; // ISO date
  servico_id?: string;
  status: StatusFila;
  notificado_em?: string;
  expira_em?: string;
  posicao: number;
}

export type StatusEncaixe = "pendente" | "confirmado" | "recusado" | "expirado";

export interface PedidoEncaixe {
  id: string;
  cliente_id: string;
  servico_id: string;
  horario_solicitado: string; // ISO datetime
  status: StatusEncaixe;
  expira_em: string;
  agendamento_id?: string;
}

export type WhatsappStatus = "conectado" | "caindo" | "desconectado";

export interface Tenant {
  slug: string;
  nome: string;
  whatsapp_status: WhatsappStatus;
}

export interface AgendaData {
  tenant: Tenant;
  clientes: Cliente[];
  servicos: Servico[];
  cortesias: Cortesia[];
  produtos: Produto[];
  horarios: HorarioFuncionamento[];
  bloqueios_fixos: BloqueioFixo[];
  bloqueios_pontuais: BloqueioPontual[];
  agendamentos: Agendamento[];
  fila: FilaEspera[];
  encaixes: PedidoEncaixe[];
}
