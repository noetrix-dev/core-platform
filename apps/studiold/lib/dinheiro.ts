// Parse de valor em reais digitado por humano.
// "55" -> 55 ; "55,50" -> 55.5 ; "1.234,56" -> 1234.56 ;
// "55.50" -> 55.5 (ponto tratado como decimal quando não há vírgula).
// Vazio / não-numérico / negativo -> null. Arredonda para 2 casas.
export function parsePrecoBRL(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(norm);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}
