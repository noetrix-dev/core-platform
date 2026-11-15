import { beforeEach, describe, expect, it, vi } from "vitest";

// Ação sair (app/entrar/acoes.ts), testada daqui porque o vitest só inclui lib/** e scripts/**.
vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("./auth", () => ({ auth: () => ({ api: { signOut: h.signOut } }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "usinagem.session_token=obsoleto.assinatura" }) }));

import { sair } from "../../app/entrar/acoes";

beforeEach(() => {
  h.signOut.mockReset().mockResolvedValue({ success: true });
});

describe("sair", () => {
  it("chama signOut com os headers da request e redireciona para /entrar (redirect real do Next, relançado pelo wrapper)", async () => {
    await expect(sair({})).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/entrar;307;/) });
    expect(h.signOut).toHaveBeenCalledTimes(1);
    const { headers } = h.signOut.mock.calls[0][0] as { headers: Headers };
    expect(headers.get("cookie")).toBe("usinagem.session_token=obsoleto.assinatura");
  });
  it("entrada que não é objeto vazio: Dados inválidos, sem signOut", async () => {
    expect(await sair("x")).toEqual({ ok: false, erro: "Dados inválidos." });
    expect(h.signOut).not.toHaveBeenCalled();
  });
  it("signOut lança: erro genérico, sem vazar a mensagem, sem redirect", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.signOut.mockRejectedValue(new Error("detalhe interno do banco"));
    expect(await sair({})).toEqual({ ok: false, erro: "Não foi possível concluir a operação." });
  });
});
