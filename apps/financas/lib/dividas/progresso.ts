import type { DebtRow, Grupo } from "../financas/types.ts";

const GRUPOS: Grupo[] = [
  "fgts",
  "consignado",
  "serasa",
  "pessoal",
  "familia",
  "cartao",
];

const cent = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function progressoDivida(
  d: Pick<DebtRow, "total_amount" | "remaining_amount">,
): number {
  if (!(d.total_amount > 0)) return 0;
  return clamp01(1 - d.remaining_amount / d.total_amount);
}

export type LinhaAgregada = {
  total: number;
  pago: number;
  restante: number;
  progresso: number;
};

export type AgregadoResult = {
  porGrupo: Record<Grupo, LinhaAgregada>;
  geral: LinhaAgregada;
};

function linha(total: number, restante: number): LinhaAgregada {
  const t = cent(total);
  const r = cent(restante);
  const pago = cent(Math.max(0, t - r));
  return { total: t, restante: r, pago, progresso: t > 0 ? pago / t : 0 };
}

export function progressoAgregado(dividas: DebtRow[]): AgregadoResult {
  const acc: Record<Grupo, { total: number; restante: number }> = Object.fromEntries(
    GRUPOS.map((g) => [g, { total: 0, restante: 0 }]),
  ) as Record<Grupo, { total: number; restante: number }>;

  let total = 0;
  let restante = 0;
  for (const d of dividas) {
    acc[d.grupo].total += d.total_amount;
    acc[d.grupo].restante += d.remaining_amount;
    total += d.total_amount;
    restante += d.remaining_amount;
  }

  const porGrupo = Object.fromEntries(
    GRUPOS.map((g) => [g, linha(acc[g].total, acc[g].restante)]),
  ) as Record<Grupo, LinhaAgregada>;

  return { porGrupo, geral: linha(total, restante) };
}
