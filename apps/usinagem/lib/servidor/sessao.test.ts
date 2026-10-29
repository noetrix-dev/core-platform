import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({ usuario: null as unknown, rows: [] as { p: string }[], db: vi.fn() }));
vi.mock("./sessao-dev", () => ({ usuarioDev: async () => h.usuario }));
vi.mock("./db", () => ({ db: h.db }));

import { ErroPermissao, requirePermissao } from "./sessao";

const compras = { id: "u3", nome: "Compras", perfil: "compras_producao" as const };

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("ENABLE_DEV_SWITCHER", "1");
  h.usuario = compras;
  h.rows = [];
  h.db.mockReset().mockImplementation(() => ({ select: () => ({ from: () => ({ where: async () => h.rows }) }) }));
});
afterEach(() => vi.unstubAllEnvs());

describe("requirePermissao", () => {
  it("devolve o usuário com as mesmas concedidas que usou na decisão", async () => {
    h.rows = [{ p: "processo.ver" }, { p: "custo.ver" }];
    expect(await requirePermissao("custo.ver")).toEqual({ ...compras, concedidas: ["processo.ver", "custo.ver"] });
  });
  it("revogação: sem a linha no banco a ação é negada, mesmo com a matriz padrão concedendo", async () => {
    h.rows = [{ p: "processo.ver" }];
    await expect(requirePermissao("custo.ver")).rejects.toMatchObject({ status: 403 });
  });
  it("tabela vazia (seed não rodado): nega não-admin e devolve concedidas vazias ao Admin", async () => {
    await expect(requirePermissao("processo.ver")).rejects.toBeInstanceOf(ErroPermissao);
    h.usuario = { id: "u1", nome: "Adm", perfil: "admin" };
    expect(await requirePermissao("processo.ver")).toEqual({ id: "u1", nome: "Adm", perfil: "admin", concedidas: [] });
  });
  it("sem sessão: 401 e o banco não é consultado", async () => {
    h.usuario = null;
    await expect(requirePermissao("processo.ver")).rejects.toMatchObject({ status: 401 });
    expect(h.db).not.toHaveBeenCalled();
  });
  it("fora do gate de dev ninguém entra", async () => {
    vi.stubEnv("ENABLE_DEV_SWITCHER", "0");
    await expect(requirePermissao("processo.ver")).rejects.toMatchObject({ status: 401 });
  });
});
