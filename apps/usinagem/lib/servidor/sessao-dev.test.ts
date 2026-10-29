import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({ cookie: undefined as string | undefined, db: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (h.cookie === undefined ? undefined : { value: h.cookie }) }) }));
vi.mock("./db", () => ({ db: h.db }));

import { usuarioDev } from "./sessao-dev";

beforeEach(() => {
  h.db.mockReset().mockReturnValue({ select: () => ({ from: () => ({ where: async () => [] }) }) });
});

describe("usuarioDev", () => {
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
