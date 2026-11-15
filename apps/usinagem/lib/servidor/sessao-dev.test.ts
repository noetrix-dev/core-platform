import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({ cookie: undefined as string | undefined, db: vi.fn(), cookies: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: h.cookies }));
vi.mock("./db", () => ({ db: h.db }));

import { usuarioDev } from "./sessao-dev";

// Alteração de teste: usuarioDev agora só responde com NODE_ENV=development (o vitest roda com "test").
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  h.cookies.mockReset().mockImplementation(async () => ({ get: () => (h.cookie === undefined ? undefined : { value: h.cookie }) }));
  h.db.mockReset().mockReturnValue({ select: () => ({ from: () => ({ where: async () => [] }) }) });
});

afterEach(() => vi.unstubAllEnvs());

describe("usuarioDev", () => {
  it.each([["production"], ["test"], [undefined]])("NODE_ENV %j: null sem ler o cookie nem consultar o banco, mesmo com uuid válido e linha no banco", async (nodeEnv) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    h.cookie = "00000000-0000-4000-8000-000000000001";
    h.db.mockReturnValue({ select: () => ({ from: () => ({ where: async () => [{ id: h.cookie, nome: "[FICTÍCIO] Dev", perfil: "admin" }] }) }) });
    expect(await usuarioDev()).toBeNull();
    expect(h.cookies).not.toHaveBeenCalled();
    expect(h.db).not.toHaveBeenCalled();
  });
  it.each(["abc", "", "00000000-0000-4000-8000-00000000000g", "' or 1=1 --", "00000000-0000-4000-8000-000000000001 "])(
    "cookie fora do formato uuid (%j): null sem consultar o banco",
    async (valor) => {
      h.cookie = valor;
      expect(await usuarioDev()).toBeNull();
      expect(h.db).not.toHaveBeenCalled();
    },
  );
  it("sem cookie: null sem consultar o banco", async () => {
    h.cookie = undefined;
    expect(await usuarioDev()).toBeNull();
    expect(h.db).not.toHaveBeenCalled();
  });
  it("uuid válido consulta o banco; sem linha, null", async () => {
    h.cookie = "00000000-0000-4000-8000-000000000001";
    expect(await usuarioDev()).toBeNull();
    expect(h.db).toHaveBeenCalledTimes(1);
  });
});
