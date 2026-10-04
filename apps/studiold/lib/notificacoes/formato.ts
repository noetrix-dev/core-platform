// Rótulos e tempo relativo do sino de notificações do painel. Puro e testável
// (lib/agenda/agenda.check.ts).

export type TipoNotificacao = "agendamento_criado" | "agendamento_cancelado" | "agendamento_remarcado";
export type CanalNotificacao = "site" | "whatsapp_bot";

export function tempoRelativo(iso: string, agora: number): string {
  const diff = agora - Date.parse(iso);
  if (!Number.isFinite(diff) || diff < 60_000) return "agora";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.floor(h / 24);
  return dias === 1 ? "ontem" : `há ${dias} dias`;
}

const TIPO: Record<TipoNotificacao, string> = {
  agendamento_criado: "Novo agendamento",
  agendamento_cancelado: "Cancelamento",
  agendamento_remarcado: "Remarcação",
};

export function rotuloTipo(tipo: TipoNotificacao): string {
  return TIPO[tipo];
}

export function rotuloCanal(canal: CanalNotificacao): string {
  return canal === "whatsapp_bot" ? "WhatsApp" : "Site";
}
