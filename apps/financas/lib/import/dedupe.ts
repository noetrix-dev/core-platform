import { createHash } from "node:crypto";

export function hashTransacao(input: {
  accountId: string;
  dataIso: string;
  valor: number;
  memo: string;
}): string {
  const chave = `${input.accountId}|${input.dataIso}|${input.valor.toFixed(2)}|${input.memo
    .trim()
    .toLowerCase()}`;
  return createHash("sha1").update(chave).digest("hex");
}

export type CandidatoIn = { hash: string; fitid: string | null };
export type CandidatoOut = CandidatoIn & { externalId: string; novo: boolean };

export function classificar(
  candidatos: CandidatoIn[],
  jaImportados: Set<string>,
): CandidatoOut[] {
  return candidatos.map((c) => {
    const externalId = c.fitid ?? c.hash;
    return { ...c, externalId, novo: !jaImportados.has(externalId) };
  });
}
