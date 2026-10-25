import { afterAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { TABELAS_APPEND_ONLY } from "./append-only";
import { bancoDisponivel } from "./teste-banco";
import { urlLocal } from "./url-local";

// Convenção da spec §4 e exceções documentadas. Lê o catálogo do Postgres com a role da aplicação.
const COM_CRIADO_E_ATUALIZADO = [
  "usuarios", "clientes", "processos", "revisoes_comerciais", "itens_revisao",
  "configuracoes", "sequencias_numeracao", "perfis", "permissoes",
];
const SO_CRIADO_EM = ["perfil_permissoes", "eventos_auditoria"];
const COM_CRIADO_POR = [
  "usuarios", "clientes", "processos", "revisoes_comerciais", "itens_revisao",
  "configuracoes", "sequencias_numeracao",
];
const SEM_CRIADO_POR = ["perfis", "permissoes", "perfil_permissoes", "eventos_auditoria"];
const CRIADO_POR_OBRIGATORIO = ["processos", "revisoes_comerciais"];

const temBanco = bancoDisponivel();

describe.skipIf(!temBanco)("estrutura das tabelas (spec §4 e §6.8)", () => {
  const banco = temBanco ? drizzle(urlLocal(process.env.DATABASE_URL), { schema }) : undefined!;
  afterAll(async () => {
    await banco?.$client.end();
  });

  const colunas = async (tabelas: string[], nomes: string[]) =>
    (
      await banco.$client.query<{ tabela: string; coluna: string; nulo: string; padrao: string | null; tipo: string }>(
        `select table_name as tabela, column_name as coluna, is_nullable as nulo, column_default as padrao, data_type as tipo
           from information_schema.columns
          where table_schema = 'public' and table_name = any($1) and column_name = any($2)`,
        [tabelas, nomes],
      )
    ).rows;

  it("criado_em e atualizado_em: timestamptz NOT NULL DEFAULT now()", async () => {
    const rows = await colunas(COM_CRIADO_E_ATUALIZADO, ["criado_em", "atualizado_em"]);
    for (const t of COM_CRIADO_E_ATUALIZADO) {
      for (const c of ["criado_em", "atualizado_em"]) {
        const col = rows.find((r) => r.tabela === t && r.coluna === c);
        expect(col, `${t}.${c}`).toBeDefined();
        expect(col!.nulo, `${t}.${c} nulo`).toBe("NO");
        expect(col!.tipo, `${t}.${c} tipo`).toBe("timestamp with time zone");
        expect(col!.padrao, `${t}.${c} default`).toMatch(/^now\(\)/);
      }
    }
  });

  it("exceções: perfil_permissoes e eventos_auditoria só com criado_em", async () => {
    const rows = await colunas(SO_CRIADO_EM, ["criado_em", "atualizado_em"]);
    for (const t of SO_CRIADO_EM) {
      expect(rows.some((r) => r.tabela === t && r.coluna === "criado_em"), `${t}.criado_em`).toBe(true);
      expect(rows.some((r) => r.tabela === t && r.coluna === "atualizado_em"), `${t}.atualizado_em`).toBe(false);
    }
  });

  it("criado_por: FK para usuarios, nullable nas novas, NOT NULL onde já era", async () => {
    const rows = await colunas([...COM_CRIADO_POR, ...SEM_CRIADO_POR], ["criado_por"]);
    for (const t of COM_CRIADO_POR) {
      const col = rows.find((r) => r.tabela === t);
      expect(col, `${t}.criado_por`).toBeDefined();
      expect(col!.nulo, `${t}.criado_por nulo`).toBe(CRIADO_POR_OBRIGATORIO.includes(t) ? "NO" : "YES");
    }
    for (const t of SEM_CRIADO_POR) expect(rows.some((r) => r.tabela === t), `${t} sem criado_por`).toBe(false);

    const { rows: fks } = await banco.$client.query<{ tabela: string; alvo: string; del: string; upd: string }>(
      `select c.conrelid::regclass::text as tabela, c.confrelid::regclass::text as alvo,
              c.confdeltype as del, c.confupdtype as upd
         from pg_constraint c
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
        where c.contype = 'f' and a.attname = 'criado_por'`,
    );
    for (const t of COM_CRIADO_POR) {
      const fk = fks.find((f) => f.tabela === t);
      expect(fk?.alvo, `${t}.criado_por referencia`).toBe("usuarios");
      expect([fk?.del, fk?.upd], `${t}.criado_por ações`).toEqual(["a", "a"]);
    }
  });

  it("tabela append-only não tem FK com CASCADE, SET NULL ou SET DEFAULT", async () => {
    const { rows } = await banco.$client.query<{ tabela: string; restricao: string }>(
      `select c.conrelid::regclass::text as tabela, c.conname as restricao
         from pg_constraint c
        where c.contype = 'f'
          and c.conrelid::regclass::text = any($1)
          and (c.confdeltype in ('c', 'n', 'd') or c.confupdtype in ('c', 'n', 'd'))`,
      [[...TABELAS_APPEND_ONLY]],
    );
    expect(rows).toEqual([]);
  });
});
