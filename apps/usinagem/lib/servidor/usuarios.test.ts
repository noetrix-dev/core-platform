import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray, like, notInArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./db/schema";
import { bancoDisponivel } from "./db/teste-banco";
import { urlLocal } from "./db/url-local";
import { alterarUsuario, type LinhaTravada } from "./usuarios";
import type { SessaoAutorizada } from "./sessao";
import { ehMensagemDeDominio, ErroDominio } from "../dominio/comum";
import type { Perfil } from "../dominio/permissoes/perfis";

const temBanco = bancoDisponivel();
const RECUSADA = "Alteração de usuário recusada.";
const DESATUALIZADA = "Registro alterado por outra pessoa.";

/** Guarda do teste que commita: todo alvo de escrita tem e-mail @ficticio.invalid e flag ficticio. Lança antes de qualquer escrita. */
function exigeAlvoFicticio(u: { email: string; ficticio: boolean }): void {
  if (!u.email.trim().toLowerCase().endsWith("@ficticio.invalid") || !u.ficticio) throw new Error("Alvo de alteração fora de @ficticio.invalid.");
}

describe("exigeAlvoFicticio (alteração)", () => {
  it("só e-mail @ficticio.invalid com flag ficticio passa", () => {
    expect(() => exigeAlvoFicticio({ email: "teste-1@ficticio.invalid", ficticio: true })).not.toThrow();
    for (const u of [
      { email: "teste-1@ficticio.invalid", ficticio: false },
      { email: "x@empresa.com.br", ficticio: true },
      { email: "x@ficticio.invalid.com", ficticio: true },
    ])
      expect(() => exigeAlvoFicticio(u)).toThrow("Alvo de alteração fora de @ficticio.invalid.");
  });
});

describe.skipIf(!temBanco)("alterarUsuario (Postgres local)", () => {
  const banco = temBanco ? drizzle(urlLocal(process.env.DATABASE_URL), { schema }) : undefined!;
  afterAll(async () => {
    await banco?.$client.end();
  });
  type Tx = Parameters<Parameters<typeof banco.transaction>[0]>[0];
  type Exec = Tx | typeof banco;

  const REVERTER = new Error("reverter");
  let reversiveis = 0;
  /**
   * Tudo dentro de uma transação desfeita no fim: nada do teste fica no banco. O ROLLBACK é garantido também quando o
   * teste falha: o drizzle faz `rollback` no catch de toda exceção (node-postgres/session.js:188-190, savepoint em :218-220),
   * e aqui o caminho feliz também lança (REVERTER). `aninhada` usa o tx de fora: SAVEPOINT + ROLLBACK TO SAVEPOINT.
   */
  async function emTransacao(fn: (tx: Tx) => Promise<void>, aninhada?: Tx) {
    reversiveis++;
    try {
      const r = await (aninhada ?? banco)
        .transaction(async (tx) => {
          await fn(tx);
          throw REVERTER;
        })
        .catch((e: unknown) => e);
      if (r !== REVERTER) throw r;
    } finally {
      reversiveis--;
    }
  }
  /**
   * Desativa os OUTROS Admins reais ativos (sem escopo por id: só existe dentro de emTransacao, que sempre reverte).
   * Torna os casos de "último Admin" deterministas em qualquer banco local, inclusive com um Admin real criado à mão.
   */
  const neutralizarAdminsReais = async (tx: Tx, exceto: string[]) => {
    if (reversiveis === 0) throw new Error("Neutralização fora de transação revertida.");
    await tx
      .update(schema.usuarios)
      .set({ ativo: false })
      .where(and(eq(schema.usuarios.perfilId, "admin"), eq(schema.usuarios.ativo, true), eq(schema.usuarios.ficticio, false), notInArray(schema.usuarios.id, exceto)));
  };

  const criar = async (b: Exec, perfil: Perfil, ficticio: boolean, ativo = true) => {
    const email = `teste-${randomUUID()}@ficticio.invalid`;
    const [u] = await b
      .insert(schema.usuarios)
      .values({ nome: "[FICTÍCIO] Alteração", email, perfilId: perfil, ativo, ficticio })
      .returning({ id: schema.usuarios.id, email: schema.usuarios.email, ficticio: schema.usuarios.ficticio });
    return u;
  };
  const autorDe = (id: string): SessaoAutorizada => ({ id, nome: "[FICTÍCIO] Autor", perfil: "admin", concedidas: [], sessaoCriadaEm: new Date() });
  const sessao = (b: Exec, userId: string) => b.insert(schema.sessoes).values({ token: randomUUID(), userId, expiresAt: new Date(Date.now() + 60_000) });
  const sessoesDe = (b: Exec, id: string) => b.select().from(schema.sessoes).where(eq(schema.sessoes.userId, id));
  const linha = async (b: Exec, id: string) => (await b.select().from(schema.usuarios).where(eq(schema.usuarios.id, id)))[0];
  const eventos = (b: Exec, id: string) =>
    b.select().from(schema.eventosAuditoria).where(and(eq(schema.eventosAuditoria.entidadeId, id), eq(schema.eventosAuditoria.operacao, "usuario_alterado")));
  const erroDe = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as Error);
  const esperaRecusa = async (p: Promise<unknown>, msg: string) => {
    const e = await erroDe(p);
    expect(e).toBeInstanceOf(ErroDominio);
    expect(e?.message).toBe(msg);
    expect(ehMensagemDeDominio(msg)).toBe(true);
  };

  it("neutralização é desfeita: Admins reais ativos do banco e um criado na transação de fora voltam ativos, mesma versão", async () => {
    const reaisAtivos = () =>
      banco
        .select({ id: schema.usuarios.id, versao: schema.usuarios.versao })
        .from(schema.usuarios)
        .where(and(eq(schema.usuarios.perfilId, "admin"), eq(schema.usuarios.ativo, true), eq(schema.usuarios.ficticio, false)))
        .orderBy(schema.usuarios.id);
    const doBanco = await reaisAtivos(); // só leitura
    await expect(neutralizarAdminsReais(undefined!, [])).rejects.toThrow("Neutralização fora de transação revertida.");
    await emTransacao(async (fora) => {
      // Admin real só existe dentro da transação de fora; a neutralização roda num savepoint revertido.
      const r = await criar(fora, "admin", false);
      await emTransacao(async (dentro) => {
        await neutralizarAdminsReais(dentro, []);
        expect(await linha(dentro, r.id)).toMatchObject({ ativo: false });
      }, fora);
      expect(await linha(fora, r.id)).toMatchObject({ ativo: true, versao: 1 });
    });
    expect(await reaisAtivos()).toEqual(doBanco);
  });

  it("1. desativar o único Admin ativo (real) é recusado com a mensagem genérica; nada muda", async () => {
    await emTransacao(async (tx) => {
      const autor = await criar(tx, "tecnico", true);
      const a = await criar(tx, "admin", false);
      // Outro Admin real ativo: sem a neutralização ele protegeria `a` e o caso cairia.
      await criar(tx, "admin", false);
      await neutralizarAdminsReais(tx, [a.id]);
      await sessao(tx, a.id);
      const antes = await linha(tx, a.id);
      await esperaRecusa(alterarUsuario(tx, autorDe(autor.id), a.id, 1, { ativo: false }), RECUSADA);
      expect(await linha(tx, a.id)).toEqual(antes);
      expect(await eventos(tx, a.id)).toHaveLength(0);
      expect(await sessoesDe(tx, a.id)).toHaveLength(1);
    });
  });

  it("2. com dois Admins ativos, desativar um passa: versão +1, relógio do app, sessões só dele somem, evento com antes e depois", async () => {
    await emTransacao(async (tx) => {
      const autor = await criar(tx, "tecnico", true);
      const a = await criar(tx, "admin", false);
      const b = await criar(tx, "admin", false);
      await sessao(tx, a.id);
      await sessao(tx, a.id);
      await sessao(tx, b.id);
      const t0 = new Date();
      await alterarUsuario(tx, autorDe(autor.id), a.id, 1, { ativo: false });
      const depois = await linha(tx, a.id);
      expect(depois).toMatchObject({ ativo: false, perfilId: "admin", versao: 2 });
      // now() do banco é o início da transação de teste, anterior a t0: só o relógio do app passa daqui.
      expect(depois.atualizadoEm.getTime()).toBeGreaterThanOrEqual(t0.getTime());
      expect(await sessoesDe(tx, a.id)).toHaveLength(0);
      expect(await sessoesDe(tx, b.id)).toHaveLength(1);
      const [ev] = await eventos(tx, a.id);
      expect(ev).toMatchObject({
        autorId: autor.id,
        entidade: "usuarios",
        entidadeId: a.id,
        antes: { perfil: "admin", ativo: true },
        depois: { perfil: "admin", ativo: false },
      });
      expect(await linha(tx, b.id)).toMatchObject({ ativo: true, versao: 1 });
    });
  });

  it("4. versão desatualizada é recusada e nada muda (nem sessões, nem evento)", async () => {
    await emTransacao(async (tx) => {
      const autor = await criar(tx, "tecnico", true);
      const c = await criar(tx, "comercial", true);
      await sessao(tx, c.id);
      await tx.update(schema.usuarios).set({ versao: 2 }).where(eq(schema.usuarios.id, c.id));
      const antes = await linha(tx, c.id);
      await esperaRecusa(alterarUsuario(tx, autorDe(autor.id), c.id, 1, { ativo: false }), DESATUALIZADA);
      expect(await linha(tx, c.id)).toEqual(antes);
      expect(await sessoesDe(tx, c.id)).toHaveLength(1);
      expect(await eventos(tx, c.id)).toHaveLength(0);
    });
  });

  it("5. trocar o perfil do último Admin (real) para comercial é recusado", async () => {
    await emTransacao(async (tx) => {
      const autor = await criar(tx, "tecnico", true);
      const a = await criar(tx, "admin", false);
      await criar(tx, "admin", false);
      await neutralizarAdminsReais(tx, [a.id]);
      const antes = await linha(tx, a.id);
      await esperaRecusa(alterarUsuario(tx, autorDe(autor.id), a.id, 1, { perfil: "comercial" }), RECUSADA);
      expect(await linha(tx, a.id)).toEqual(antes);
      expect(await eventos(tx, a.id)).toHaveLength(0);
    });
  });

  it("6. Admin fictício ativo não protege Admin real; Admin real protege o fictício", async () => {
    await emTransacao(async (tx) => {
      const autor = await criar(tx, "tecnico", true);
      const real = await criar(tx, "admin", false);
      const fic = await criar(tx, "admin", true);
      await criar(tx, "admin", false);
      await neutralizarAdminsReais(tx, [real.id]);
      await esperaRecusa(alterarUsuario(tx, autorDe(autor.id), real.id, 1, { ativo: false }), RECUSADA);
      expect(await linha(tx, real.id)).toMatchObject({ ativo: true, versao: 1 });
      await alterarUsuario(tx, autorDe(autor.id), fic.id, 1, { ativo: false });
      expect(await linha(tx, fic.id)).toMatchObject({ ativo: false, versao: 2 });
    });
  });

  it("7. troca de perfil derruba as sessões do alvo; reativar sem trocar perfil as mantém", async () => {
    await emTransacao(async (tx) => {
      const autor = await criar(tx, "tecnico", true);
      const t = await criar(tx, "tecnico", true);
      await sessao(tx, t.id);
      await alterarUsuario(tx, autorDe(autor.id), t.id, 1, { perfil: "comercial" });
      expect(await linha(tx, t.id)).toMatchObject({ perfilId: "comercial", versao: 2 });
      expect(await sessoesDe(tx, t.id)).toHaveLength(0);
      const [ev] = await eventos(tx, t.id);
      expect(ev).toMatchObject({ antes: { perfil: "tecnico", ativo: true }, depois: { perfil: "comercial", ativo: true } });
      await sessao(tx, t.id);
      await alterarUsuario(tx, autorDe(autor.id), t.id, 2, { perfil: "comercial", ativo: true });
      expect(await sessoesDe(tx, t.id)).toHaveLength(1);
    });
  });

  it("alvo inexistente, id fora de UUID, versão não inteira ou perfil inexistente: recusa genérica, sem evento", async () => {
    await emTransacao(async (tx) => {
      const autor = await criar(tx, "tecnico", true);
      const t = await criar(tx, "tecnico", true);
      await esperaRecusa(alterarUsuario(tx, autorDe(autor.id), randomUUID(), 1, { ativo: false }), RECUSADA);
      await esperaRecusa(alterarUsuario(tx, autorDe(autor.id), "nao-e-uuid", 1, { ativo: false }), RECUSADA);
      await esperaRecusa(alterarUsuario(tx, autorDe(autor.id), t.id, 1.5, { ativo: false }), RECUSADA);
      await esperaRecusa(alterarUsuario(tx, autorDe(autor.id), t.id, 1, { perfil: "visitante" as Perfil }), RECUSADA);
      expect(await linha(tx, t.id)).toMatchObject({ ativo: true, versao: 1, perfilId: "tecnico" });
      expect(await eventos(tx, t.id)).toHaveLength(0);
    });
  });

  // Exceção do responsável humano à transação desfeita: duas conexões reais, dados commitados.
  // Só usuários novos @ficticio.invalid e ficticio=true criados aqui; toda escrita tem escopo pelos ids deles.
  it("3. concorrência: duas conexões desativam A e B; a segunda espera a trava e vê a desativação da primeira (3 rodadas)", async () => {
    const c1 = drizzle(urlLocal(process.env.DATABASE_URL), { schema });
    try {
      const c2 = drizzle(urlLocal(process.env.DATABASE_URL), { schema });
      try {
        const autor = await criar(banco, "tecnico", true);
        // A espera é detectada por pg_blocking_pids, sem temporização: mais rodadas não acrescentam prova e cada uma deixa 2 usuários commitados.
        const RODADAS = 3;
        let recusas = 0;
        for (let rodada = 0; rodada < RODADAS; rodada++) {
          const a = await criar(banco, "admin", true);
          const b = await criar(banco, "admin", true);
          try {
            exigeAlvoFicticio(a);
            exigeAlvoFicticio(b);
            let visto2: LinhaTravada[] | undefined;
            let p2: Promise<void> | undefined;
            let terminou2 = false;
            let esperouTrava = false;
            const r1 = alterarUsuario(c1, autorDe(autor.id), a.id, 1, { ativo: false }, {
              aposTrava: async (_linhas, tx) => {
                // A primeira tem as travas. Só agora a segunda começa; espera até ela bloquear nesta transação (ou terminar, sem trava).
                const [{ pid }] = (await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows;
                p2 = alterarUsuario(c2, autorDe(autor.id), b.id, 1, { ativo: false }, {
                  aposTrava: async (linhas) => {
                    visto2 = linhas;
                  },
                });
                p2.then(
                  () => (terminou2 = true),
                  () => (terminou2 = true),
                );
                for (let i = 0; !terminou2; i++) {
                  if (i > 5000) throw new Error("A segunda transação não bloqueou nem terminou.");
                  const r = await banco.execute<{ b: boolean }>(sql`select exists (select 1 from pg_stat_activity where ${pid}::int = any(pg_blocking_pids(pid))) as b`);
                  if (r.rows[0].b) {
                    esperouTrava = true;
                    break;
                  }
                }
              },
            });
            const segunda = r1.catch(() => {}).then(() => p2 ?? Promise.reject(new Error("A segunda transação não começou.")));
            const [s1, s2] = await Promise.allSettled([r1, segunda]);
            expect(s1.status).toBe("fulfilled");
            // Com FOR UPDATE a segunda bloqueia na trava da primeira; sem ele, termina sem esperar.
            expect({ rodada, esperouTrava }).toEqual({ rodada, esperouTrava: true });
            expect(visto2).toBeDefined();
            // A segunda viu a desativação commitada da primeira: A saiu do conjunto travado.
            expect(visto2!.map((l) => l.id)).not.toContain(a.id);
            // B é fictício: qualquer outro Admin ativo que a segunda viu o protege. Sem nenhum, exatamente uma recusa.
            const protetores = visto2!.filter((l) => l.id !== b.id && l.perfil === "admin" && l.ativo);
            if (protetores.length === 0) {
              recusas++;
              expect(s2.status).toBe("rejected");
              expect((s2 as PromiseRejectedResult).reason).toBeInstanceOf(ErroDominio);
              expect((s2 as PromiseRejectedResult).reason.message).toBe(RECUSADA);
              expect(await linha(banco, b.id)).toMatchObject({ ativo: true, versao: 1 });
            } else expect(s2.status).toBe("fulfilled");
            const [{ n }] = await banco
              .select({ n: sql<number>`count(*)::int` })
              .from(schema.usuarios)
              .where(and(eq(schema.usuarios.perfilId, "admin"), eq(schema.usuarios.ativo, true)));
            expect(n).toBeGreaterThanOrEqual(1);
          } finally {
            // Limpeza: desativa o que sobrou de A/B (escopo pelos ids e pelo domínio fictício; a guarda já rodou acima).
            exigeAlvoFicticio(a);
            exigeAlvoFicticio(b);
            await banco
              .update(schema.usuarios)
              .set({ ativo: false })
              .where(and(inArray(schema.usuarios.id, [a.id, b.id]), like(schema.usuarios.email, "%@ficticio.invalid"), eq(schema.usuarios.ficticio, true)));
          }
        }
        // Banco local com o Admin fictício do seed ativo: ele protege A e B (fictícios), então recusas = 0 aqui; sem outro Admin, todas.
        console.info(`concorrência: ${recusas} rodada(s) com recusa de ${RODADAS}.`);
        expect(recusas === 0 || recusas === RODADAS).toBe(true);
      } finally {
        await c2.$client.end();
      }
    } finally {
      await c1.$client.end();
    }
  }, 60_000);
});
