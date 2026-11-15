import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Seletor de dev (app/dev/perfil/*.dev.ts(x)), testado daqui porque o vitest só inclui lib/** e scripts/**.
// Sem banco: db() é um dublê que devolve as linhas do teste e guarda o WHERE para ser renderizado em SQL.
vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({ linhas: [] as unknown[], where: [] as unknown[], set: vi.fn(), db: vi.fn() }));
vi.mock("./db", () => ({ db: h.db }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: h.set }) }));
vi.mock("../../app/dev/perfil/BotaoPerfil.dev", () => ({ BotaoPerfil: () => null }));

import { escolherPerfil } from "../../app/dev/perfil/acoes.dev";
import SeletorPerfil from "../../app/dev/perfil/page.dev";
import { COOKIE_USUARIO_DEV } from "./sessao-dev";

const ID = "00000000-0000-4000-8000-000000000001";
const ligarGate = () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("ENABLE_DEV_SWITCHER", "1");
};

beforeEach(() => {
  h.linhas = [];
  h.where = [];
  h.set.mockReset();
  h.db.mockReset().mockReturnValue({
    select: () => ({
      from: () => ({
        where: async (cond: unknown) => {
          h.where.push(cond);
          return h.linhas;
        },
      }),
    }),
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const GENERICO = { ok: false, erro: "Não foi possível concluir a operação." };

describe("escolherPerfil", () => {
  it.each([
    ["production", "1"],
    ["test", "1"],
    ["development", undefined],
    ["development", "true"],
  ])("gate desligado (NODE_ENV %j, ENABLE_DEV_SWITCHER %j): recusa sem consultar o banco nem gravar cookie", async (nodeEnv, flag) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("ENABLE_DEV_SWITCHER", flag);
    h.linhas = [{ id: ID, ficticio: true, ativo: true }];
    expect(await escolherPerfil({ id: ID })).toEqual(GENERICO);
    expect(h.db).not.toHaveBeenCalled();
    expect(h.set).not.toHaveBeenCalled();
  });
  it.each([{ id: "abc" }, { id: "" }, { id: `${ID} ` }, {}, "x"])("entrada inválida (%j): Dados inválidos.", async (entrada) => {
    ligarGate();
    expect(await escolherPerfil(entrada)).toEqual({ ok: false, erro: "Dados inválidos." });
    expect(h.db).not.toHaveBeenCalled();
    expect(h.set).not.toHaveBeenCalled();
  });
  it.each([
    ["usuário real (ficticio=false), ativo", { id: ID, ficticio: false, ativo: true }],
    ["fictício inativo", { id: ID, ficticio: true, ativo: false }],
    ["real e inativo", { id: ID, ficticio: false, ativo: false }],
  ])("%s: recusado sem gravar cookie", async (_nome, linha) => {
    ligarGate();
    h.linhas = [linha];
    expect(await escolherPerfil({ id: ID })).toEqual(GENERICO);
    expect(h.set).not.toHaveBeenCalled();
  });
  it("id inexistente: recusado sem gravar cookie", async () => {
    ligarGate();
    expect(await escolherPerfil({ id: ID })).toEqual(GENERICO);
    expect(h.set).not.toHaveBeenCalled();
  });
  it("fictício ativo: grava o cookie httpOnly, sameSite strict, path / e redireciona para /", async () => {
    ligarGate();
    h.linhas = [{ id: ID, ficticio: true, ativo: true }];
    await expect(escolherPerfil({ id: ID })).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/;307;/) });
    expect(h.set).toHaveBeenCalledTimes(1);
    expect(h.set).toHaveBeenCalledWith(COOKIE_USUARIO_DEV, ID, { httpOnly: true, sameSite: "strict", path: "/" });
  });
});

describe("/dev/perfil (página)", () => {
  it.each([
    ["production", "1"],
    ["test", "1"],
    ["development", undefined],
  ])("gate desligado (NODE_ENV %j, ENABLE_DEV_SWITCHER %j): notFound sem consultar o banco", async (nodeEnv, flag) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("ENABLE_DEV_SWITCHER", flag);
    await expect(SeletorPerfil()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(h.db).not.toHaveBeenCalled();
  });
  it("gate ligado: lista filtrando fictício E ativo no WHERE", async () => {
    ligarGate();
    h.linhas = [{ id: ID, nome: "[FICTÍCIO] Dev", perfil: "admin" }];
    await SeletorPerfil();
    expect(h.where).toHaveLength(1);
    const { sql, params } = new PgDialect().sqlToQuery(h.where[0] as SQL);
    expect(sql).toBe('("usuarios"."ficticio" = $1 and "usuarios"."ativo" = $2)');
    expect(params).toEqual([true, true]);
  });
});
