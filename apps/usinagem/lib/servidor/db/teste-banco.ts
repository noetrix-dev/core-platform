export function decidirTesteDeBanco(env: { CI?: string; DATABASE_URL?: string }): "rodar" | "pular" {
  if (env.DATABASE_URL) return "rodar";
  if (env.CI) throw new Error("Testes de banco exigem DATABASE_URL no CI.");
  return "pular";
}

let avisado = false;

// Uso: describe.skipIf(!bancoDisponivel())(...). No CI sem URL o erro propaga e o arquivo falha.
export function bancoDisponivel(): boolean {
  if (decidirTesteDeBanco({ CI: process.env.CI, DATABASE_URL: process.env.DATABASE_URL }) === "pular") {
    if (!avisado) {
      avisado = true;
      console.warn("Testes de banco pulados: DATABASE_URL ausente (fora do CI).");
    }
    return false;
  }
  return true;
}
