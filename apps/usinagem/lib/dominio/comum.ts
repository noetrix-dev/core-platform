export type Id = string;
/** Valor monetário em centavos inteiros. Nunca float. */
export type Centavos = number;
/** Quantidade de MP/compras, NUMERIC(14,3) no banco, string decimal no TS (ex.: "12.500"). */
export type QuantidadeDecimal = string;

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };
export const ok = <T>(valor: T): Resultado<T> => ({ ok: true, valor });
export const falha = (erro: string): { ok: false; erro: string } => ({ ok: false, erro });

/** Idempotência: o mesmo evento (mesma chave) conta uma vez só. */
export function deduplicarPorChave<T extends { chave: string }>(itens: T[]): T[] {
  const vistas = new Set<string>();
  return itens.filter((i) => (vistas.has(i.chave) ? false : (vistas.add(i.chave), true)));
}

export const ehQuantidadeValida = (n: number): boolean => Number.isInteger(n) && n > 0;
