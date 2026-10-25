import { eq, max, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { validarNumeroInicial } from "../dominio/processo/numeracao";
import * as schema from "./db/schema";

const { sequenciasNumeracao: seq, processos } = schema;

/** Incremento atômico: o UPDATE trava a linha, então chamadas concorrentes nunca repetem número. */
export async function reservarNumero(banco: NodePgDatabase<typeof schema>, nome: string): Promise<number> {
  const [linha] = await banco
    .update(seq)
    .set({ proximo: sql`${seq.proximo} + 1`, atualizadoEm: sql`now()` })
    .where(eq(seq.nome, nome))
    .returning({ numero: sql<number>`${seq.proximo} - 1` });
  if (!linha) throw new Error("Sequência de numeração não configurada.");
  return Number(linha.numero);
}

/** Continua a sequência já usada pela empresa. Só aceita início maior que o maior número de processo. */
export async function definirNumeroInicial(banco: NodePgDatabase<typeof schema>, nome: string, inicio: number) {
  return banco.transaction(async (tx) => {
    const [{ maior }] = await tx.select({ maior: max(processos.numero) }).from(processos);
    const valido = validarNumeroInicial(inicio, maior ?? null);
    if (!valido.ok) return valido;
    await tx
      .insert(seq)
      .values({ nome, proximo: inicio })
      .onConflictDoUpdate({ target: seq.nome, set: { proximo: inicio, atualizadoEm: sql`now()` } });
    return valido;
  });
}
