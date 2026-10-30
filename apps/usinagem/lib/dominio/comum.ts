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

export const ehQuantidadeValida = (n: number): boolean => Number.isSafeInteger(n) && n > 0;

/**
 * Toda mensagem de ErroDominio, uma a uma, como literal. Mensagem fora daqui vira a genérica: valor de linha nunca entra.
 * Privado: ninguém acrescenta mensagem em runtime. O teste de consistência (scripts/cobertura-acoes.test.ts) prova que tudo que o código lança está aqui.
 */
const MENSAGENS_DE_DOMINIO = new Set<string>([
  "Posição de demanda inválida.",
  "Vínculo de demanda inválido.",
  "Posição de entrega inválida.",
  "Evento de entrega inválido.",
  "Evento de entrega repetido com conteúdo diferente.",
  "Devolução maior que o aceito.",
  "Estado de estoque inconsistente.",
  "Movimento de estoque inválido.",
  "Movimento de estoque repetido com conteúdo diferente.",
  "Reserva de estoque inválida.",
  "Entrada de status inválida.",
  "Soma fora do limite seguro.",
  "Erro de domínio.",
]);

export const ehMensagemDeDominio = (m: unknown): boolean => typeof m === "string" && MENSAGENS_DE_DOMINIO.has(m);

/** Cópia: só para o teste de consistência. Alterar o array não altera o conjunto. */
export const mensagensDeDominio = (): string[] => [...MENSAGENS_DE_DOMINIO];

/** Dado corrompido ou estado impossível. A mensagem é fechada em runtime e a instância é congelada: nada a altera depois. */
export class ErroDominio extends Error {
  override name = "ErroDominio";
  constructor(mensagem: string) {
    super(ehMensagemDeDominio(mensagem) ? mensagem : "Erro de domínio.");
    Object.freeze(this);
  }
}

const SOMA_FORA_DO_LIMITE = "Soma fora do limite seguro.";

/** Soma que falha alto se o acumulado sair de inteiro seguro (ou não for inteiro). Mensagem fixa: nunca leva valor. */
export function somar(valores: readonly number[]): number {
  let total = 0;
  for (const v of valores) {
    total += v;
    if (!Number.isSafeInteger(total)) throw new ErroDominio(SOMA_FORA_DO_LIMITE);
  }
  return total;
}
