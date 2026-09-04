import type { ResumoMes } from "./agrega.ts";

export type SplitResult = {
  metas: { necessidade: number; desejo: number; investimento: number };
  real: {
    necessidade: number;
    desejo: number;
    investimento: number;
    sem_classificacao: number;
  };
  estouro: { necessidade: boolean; desejo: boolean; investimento: boolean };
};

const cent = (n: number) => Math.round(n * 100) / 100;

export function calcularSplit(
  rendaRecebida: number,
  gastosPorBucket: ResumoMes["gastosPorBucket"],
): SplitResult {
  const base = rendaRecebida > 0 ? rendaRecebida : 0;
  const metas = {
    necessidade: cent(base * 0.5),
    desejo: cent(base * 0.3),
    investimento: cent(base * 0.2),
  };
  const real = { ...gastosPorBucket };
  return {
    metas,
    real,
    estouro: {
      necessidade: real.necessidade > metas.necessidade,
      desejo: real.desejo > metas.desejo,
      investimento: real.investimento > metas.investimento,
    },
  };
}
