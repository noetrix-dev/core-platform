// Gerador do código de verificação de 6 dígitos usado em /agendar.
// Puro e testável: rng entra por parâmetro (default Math.random) só pra
// permitir asserts determinísticos.
// ponytail: assume rng() em [0,1), contrato padrão do Math.random.
export function gerarCodigo(rng: () => number = Math.random): string {
  return String(Math.floor(rng() * 1_000_000)).padStart(6, "0");
}
