/** Datas de calendário em ISO curto (YYYY-MM-DD), sem fuso. */

function partes(iso: string): [number, number, number] {
  const [a, m, d] = iso.split("-").map(Number);
  return [a, m, d];
}

function diasNoMes(ano: number, mes1a12: number): number {
  return new Date(Date.UTC(ano, mes1a12, 0)).getUTCDate();
}

function fmt(ano: number, mes1a12: number, dia: number): string {
  const mm = String(mes1a12).padStart(2, "0");
  const dd = String(dia).padStart(2, "0");
  return `${ano}-${mm}-${dd}`;
}

export function somaMesesISO(iso: string, n: number): string {
  const [ano, mes, dia] = partes(iso);
  const total = (ano * 12 + (mes - 1)) + n;
  const novoAno = Math.floor(total / 12);
  const novoMes = (total % 12) + 1;
  const diaClamp = Math.min(dia, diasNoMes(novoAno, novoMes));
  return fmt(novoAno, novoMes, diaClamp);
}

export function fimDoMesISO(iso: string): string {
  const [ano, mes] = partes(iso);
  return fmt(ano, mes, diasNoMes(ano, mes));
}

export function hojeISO(): string {
  // en-CA dá YYYY-MM-DD; timeZone fixa no fuso de São Paulo.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}
