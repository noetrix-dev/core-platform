import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { randomUUID } from "node:crypto";
import * as schema from "./db/schema";
import { bancoDisponivel } from "./db/teste-banco";
import { urlLocal } from "./db/url-local";
import { semear } from "../../scripts/seed";
import { definirNumeroInicial, reservarNumero } from "./numeracao";

// No CI, ausência de DATABASE_URL falha em vez de pular (política em teste-banco.ts).
const temBanco = bancoDisponivel();

describe.skipIf(!temBanco)("numeração no banco", () => {
  const banco = temBanco ? drizzle(urlLocal(process.env.DATABASE_URL), { schema }) : undefined!;
  const nome = `teste_${randomUUID()}`;
  beforeAll(async () => {
    await semear(banco);
  });
  afterAll(async () => {
    await banco.delete(schema.sequenciasNumeracao).where(eq(schema.sequenciasNumeracao.nome, nome));
    await banco.$client.end();
  });

  it("20 gerações concorrentes: 20 números distintos e consecutivos", async () => {
    // Sequência de teste isolada: não passa pela regra de "maior que processos existentes".
    await banco.insert(schema.sequenciasNumeracao).values({ nome, proximo: 357 });
    const numeros = await Promise.all(Array.from({ length: 20 }, () => reservarNumero(banco, nome)));
    const ordenados = [...numeros].sort((a, b) => a - b);
    expect(new Set(numeros).size).toBe(20);
    expect(ordenados).toEqual(Array.from({ length: 20 }, (_, i) => 357 + i));
  });

  it("número inicial abaixo do maior já usado em processos é recusado", async () => {
    // Depende de haver processos (seed). Usa a sequência de teste para nunca tocar a sequência real "processo".
    expect((await definirNumeroInicial(banco, nome, 1)).ok).toBe(false);
  });
});
