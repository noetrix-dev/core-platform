// Normaliza um e-mail digitado por humano. Retorna:
//   - string canônica (trim + lowercase) quando o formato é plausível
//   - null quando a entrada está vazia (campo é opcional)
//   - "invalido" quando há texto mas não parece um e-mail
//
// ponytail: regex de sanidade (um @, um ponto no domínio, sem espaço); não
// valida TLD nem existência da caixa. Rigor real só com verificação por link.
export function limparEmail(raw: string): string | null | "invalido" {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return null;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : "invalido";
}
