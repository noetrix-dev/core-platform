export function validarNumeroInicial(inicio: number, maiorUsado: number | null): { ok: true } | { ok: false; erro: string } {
  if (!Number.isInteger(inicio) || inicio < 1) return { ok: false, erro: "O número inicial precisa ser inteiro e positivo." };
  if (maiorUsado !== null && inicio <= maiorUsado) {
    return { ok: false, erro: "O número inicial precisa ser maior que o último número já usado." };
  }
  return { ok: true };
}

export const formatarNumeroProcesso = (numero: number, letra: string): string => `${numero}-${letra}`;
