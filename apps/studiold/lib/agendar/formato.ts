// Helpers puros de apresentação do wizard de /agendar. Datas chegam do banco
// como "YYYY-MM-DD" e horas como "HH:MM(:SS)" já no fuso da barbearia
// (fn_buscar_disponibilidade), então a UI não converte fuso. Só o e-mail,
// montado no servidor (Vercel = UTC), usa partesSaoPaulo().
import { DIAS_SEMANA_CURTO, parseYmd, ymd } from "../agenda/time.ts";

export function mascararEmail(email: string): string {
  const [usuario, dominio] = email.split("@");
  if (!usuario || !dominio) return "seu e-mail";
  const ponto = dominio.lastIndexOf(".");
  const nome = ponto > 0 ? dominio.slice(0, ponto) : dominio;
  const tld = ponto > 0 ? dominio.slice(ponto) : "";
  return `${usuario[0]}***@${nome[0]}***${tld}`;
}

// Mesmo critério da ordenação de fn_catalogo_servicos_v2.
export function ehCombo(nome: string): boolean {
  return nome.toLowerCase().startsWith("combo ");
}

export function turno(hora: string): "manha" | "tarde" {
  return hora < "12:00" ? "manha" : "tarde";
}

export function rotuloDia(dataYmd: string): string {
  const d = parseYmd(dataYmd);
  const dia = DIAS_SEMANA_CURTO[d.getDay()];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${dd}/${mm}`;
}

export function proximoDia(dataYmd: string): string {
  const d = parseYmd(dataYmd);
  d.setDate(d.getDate() + 1);
  return ymd(d);
}

const FMT_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function partesSaoPaulo(iso: string): { data: string; hora: string } {
  const p = Object.fromEntries(FMT_SP.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
