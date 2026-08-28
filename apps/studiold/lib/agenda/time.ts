// Matemática de horário da agenda. Sem lib de data — minutos desde a meia-noite
// resolvem tudo que a tela precisa.

export const DIAS_SEMANA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const DIAS_SEMANA_LONGO = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "09:30" -> 570 */
export function hmToMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

/** 570 -> "09:30" */
export function minToHm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** minutos desde a meia-noite local de uma data ISO */
export function minsOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function isoAt(dayKey: string, minutesOfDay: number): string {
  const d = parseYmd(dayKey);
  d.setHours(Math.floor(minutesOfDay / 60), minutesOfDay % 60, 0, 0);
  return d.toISOString();
}

export function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "sexta-feira, 28 de agosto" — dia da semana em minúsculas, sem capitalização */
export function fmtDataLonga(dayKey: string): string {
  const d = parseYmd(dayKey);
  const mes = d.toLocaleDateString("pt-BR", { month: "long" });
  return `${DIAS_SEMANA_LONGO[d.getDay()]}, ${d.getDate()} de ${mes}`.toLowerCase();
}

export function fmtPreco(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "há 3 dias", "há 2 semanas" — grosso, o suficiente para a ficha */
export function desde(iso?: string): string | null {
  if (!iso) return null;
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 14) return `há ${dias} dias`;
  if (dias < 60) return `há ${Math.floor(dias / 7)} semanas`;
  return `há ${Math.floor(dias / 30)} meses`;
}

export function contagemRegressiva(expiraEmIso?: string, agoraMs = Date.now()): {
  texto: string;
  segundos: number;
} {
  if (!expiraEmIso) return { texto: "—", segundos: Infinity };
  const segundos = Math.round((new Date(expiraEmIso).getTime() - agoraMs) / 1000);
  if (segundos <= 0) return { texto: "expirado", segundos: 0 };
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return { texto: `${m}:${String(s).padStart(2, "0")}`, segundos };
}
