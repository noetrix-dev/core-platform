import { afterAll, describe, expect, it } from "vitest";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../lib/servidor/db/schema";
import { urlLocal } from "../lib/servidor/db/url-local";
import { TABELAS_APPEND_ONLY } from "../lib/servidor/db/append-only";
import { bancoDisponivel } from "../lib/servidor/db/teste-banco";
import { PERFIS } from "../lib/dominio/permissoes/perfis";
import { semear, USUARIOS_FICTICIOS } from "./seed";

// No CI, ausência de DATABASE_URL falha em vez de pular (política em teste-banco.ts).
const temBanco = bancoDisponivel();

describe.skipIf(!temBanco)("seed fictício e role da aplicação", () => {
  const banco = temBanco ? drizzle(urlLocal(process.env.DATABASE_URL), { schema }) : undefined!;
  afterAll(async () => {
    await banco?.$client.end();
  });

  it("é idempotente e marca tudo como fictício", async () => {
    const idsSeed = USUARIOS_FICTICIOS.map((u) => u.id);
    const contaUsuarios = async () =>
      (await banco.select({ n: count() }).from(schema.usuarios).where(inArray(schema.usuarios.id, idsSeed)))[0].n;
    await semear(banco);
    const antes = await contaUsuarios();
    await semear(banco);
    expect(antes).toBe(5);
    expect(await contaUsuarios()).toBe(5);
    const [p] = await banco.select({ n: count() }).from(schema.perfis).where(inArray(schema.perfis.id, [...PERFIS]));
    expect(p.n).toBe(5);
    // Outros testes criam usuários fictícios próprios; aqui só os do seed importam.
    const doSeed = (await banco.select().from(schema.usuarios)).filter((x) => USUARIOS_FICTICIOS.some((f) => f.id === x.id));
    expect(doSeed).toHaveLength(5);
    expect(doSeed.every((x) => x.ficticio)).toBe(true);
    const [s] = await banco.select().from(schema.sequenciasNumeracao).where(eq(schema.sequenciasNumeracao.nome, "processo"));
    expect(s.proximo).toBeGreaterThan(9003);
  });

  it("usinagem_migracao é dona de todas as tabelas; usinagem_app de nenhuma", async () => {
    const { rows } = await banco.$client.query<{ schemaname: string; tablename: string; tableowner: string }>(
      "select schemaname, tablename, tableowner from pg_tables where schemaname in ('public', 'drizzle')",
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.tableowner !== "usinagem_migracao")).toEqual([]);
    const { rows: criar } = await banco.$client.query<{ pode: boolean }>(
      "select has_schema_privilege('usinagem_app', 'public', 'CREATE') as pode",
    );
    expect(criar[0].pode).toBe(false);
    const { rows: criarDrizzle } = await banco.$client.query<{ pode: boolean }>(
      "select has_schema_privilege('usinagem_app', 'drizzle', 'CREATE') as pode",
    );
    expect(criarDrizzle[0].pode).toBe(false);
  });

  it("append-only: a aplicação não tem UPDATE, DELETE nem TRUNCATE nas 3 tabelas", async () => {
    const { rows } = await banco.$client.query<{ tabela: string; existe: boolean; update: boolean | null; colUpdate: boolean | null; del: boolean | null; trunc: boolean | null }>(
      `select t as tabela, to_regclass(t) is not null as existe,
              case when to_regclass(t) is null then null else has_table_privilege('usinagem_app', t, 'UPDATE') end as update,
              case when to_regclass(t) is null then null else has_any_column_privilege('usinagem_app', t, 'UPDATE') end as "colUpdate",
              case when to_regclass(t) is null then null else has_table_privilege('usinagem_app', t, 'DELETE') end as del,
              case when to_regclass(t) is null then null else has_table_privilege('usinagem_app', t, 'TRUNCATE') end as trunc
         from unnest($1::text[]) as t`,
      [TABELAS_APPEND_ONLY],
    );
    expect(rows.map((r) => r.tabela)).toEqual([...TABELAS_APPEND_ONLY]);
    // eventos_auditoria existe desde o 1A; as outras passam a ser checadas quando forem criadas (PR 3 e PR 5).
    expect(rows.find((r) => r.tabela === "eventos_auditoria")?.existe).toBe(true);
    const comEscrita = rows.filter((r) => r.existe && (r.update || r.colUpdate || r.del || r.trunc));
    expect(comEscrita).toEqual([]);
  });

  it("a role da aplicação insere na auditoria mas não altera nem apaga", async () => {
    const [ev] = await banco
      .insert(schema.eventosAuditoria)
      .values({ operacao: "teste_role", entidade: "teste" })
      .returning({ id: schema.eventosAuditoria.id });
    // O drizzle embrulha o erro do pg ("Failed query"); a causa traz o código 42501 e a mensagem.
    const negado = (e: unknown) => (e as { cause?: { code?: string; message?: string } }).cause;
    const upd = await banco
      .update(schema.eventosAuditoria)
      .set({ operacao: "x" })
      .where(eq(schema.eventosAuditoria.id, ev.id))
      .then(() => undefined, negado);
    expect(upd?.code).toBe("42501");
    expect(upd?.message).toMatch(/permission denied/);
    const del = await banco
      .delete(schema.eventosAuditoria)
      .where(eq(schema.eventosAuditoria.id, ev.id))
      .then(() => undefined, negado);
    expect(del?.code).toBe("42501");
    expect(del?.message).toMatch(/permission denied/);
  });

  it("auditoria registra entidade com chave text (configuracoes) e com UUID como texto", async () => {
    const [cfg] = await banco
      .insert(schema.eventosAuditoria)
      .values({ operacao: "teste_chave_text", entidade: "configuracoes", entidadeId: "letra", depois: { regra: "pendente" } })
      .returning();
    expect(cfg.entidadeId).toBe("letra");
    const uuid = USUARIOS_FICTICIOS[0].id;
    const [usr] = await banco
      .insert(schema.eventosAuditoria)
      .values({ operacao: "teste_chave_text", entidade: "usuarios", entidadeId: uuid })
      .returning();
    expect(usr.entidadeId).toBe(uuid);
    const achados = await banco
      .select()
      .from(schema.eventosAuditoria)
      .where(and(eq(schema.eventosAuditoria.entidade, "configuracoes"), eq(schema.eventosAuditoria.entidadeId, "letra")));
    expect(achados.some((e) => e.id === cfg.id)).toBe(true);
  });

  it("revisão vigente é a de maior sequencia, não a de maior letra em texto", async () => {
    const revs = await banco
      .select()
      .from(schema.revisoesComerciais)
      .where(eq(schema.revisoesComerciais.processoId, "00000000-0000-4000-8000-000000000202"))
      .orderBy(desc(schema.revisoesComerciais.sequencia));
    expect(revs.map((r) => [r.sequencia, r.letra])).toEqual([[2, "B"], [1, "A"]]);
  });
});
