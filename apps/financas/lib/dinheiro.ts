// Parse de valor monetário digitado por humano (formulários) ou vindo de
// arquivo (OFX). Ponto é separador de milhar só quando também há vírgula;
// sem vírgula, o ponto é decimal.
// "55" -> 55 ; "55,50" -> 55.5 ; "1.234,56" -> 1234.56 ;
// "4597.00" -> 4597 (ponto decimal, sem milhar) ; "-89.90" -> -89.9 ;
// Vazio / não-numérico -> NaN.
export function parseBRL(raw: string): number {
  const t = raw.trim();
  if (t === "") return NaN;
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return Number(norm);
}
