import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm";
import { z } from "zod";

vi.mock("server-only", () => ({}));
vi.mock("./sessao", () => {
  class ErroPermissao extends Error {
    constructor(readonly status: 401 | 403) {
      super(status === 401 ? "Sessão ausente." : "Sem permissão para esta ação.");
    }
  }
  return { ErroPermissao, requirePermissao: vi.fn() };
});
vi.mock("next/navigation", () => ({
  // Imita o contrato real: erros internos do Next (redirect/notFound) são relançados.
  unstable_rethrow: vi.fn((e: unknown) => {
    if ((e as { digest?: string } | null)?.digest?.startsWith("NEXT_REDIRECT")) throw e;
  }),
}));

import { unstable_rethrow } from "next/navigation";
import { ErroDominio } from "../dominio/comum";
import { acao, acaoPublica, rota } from "./acao";
import { ErroPermissao, requirePermissao } from "./sessao";

const usuario = { id: "u1", nome: "Adm", perfil: "admin" as const };
const esquema = z.object({ n: z.number() });
const GENERICA = "Não foi possível concluir a operação.";
const permissao = vi.mocked(requirePermissao);

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  permissao.mockReset().mockResolvedValue(usuario);
  vi.mocked(unstable_rethrow).mockClear();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => log.mockRestore());

const logado = () => JSON.stringify(log.mock.calls);
const erroDeBanco = () => Object.assign(new Error("Estado de estoque inconsistente."), { detail: "valor-secreto", code: "23505" });
const erroDrizzle = () =>
  new DrizzleQueryError("insert into t (a) values ($1)", ["valor-secreto"], Object.assign(new Error('duplicate key "valor-secreto"'), { code: "23505" }));

describe("acao", () => {
  it("sem sessão: erro de sessão e fn nunca roda", async () => {
    permissao.mockRejectedValue(new ErroPermissao(401));
    const fn = vi.fn();
    expect(await acao("processo.ver", esquema, fn)({ n: 1 })).toEqual({ ok: false, erro: "Sessão ausente." });
    expect(fn).not.toHaveBeenCalled();
  });
  it("negado: mensagem de permissão e fn nunca roda", async () => {
    permissao.mockRejectedValue(new ErroPermissao(403));
    const fn = vi.fn();
    expect(await acao("processo.ver", esquema, fn)({ n: 1 })).toEqual({ ok: false, erro: "Sem permissão para esta ação." });
    expect(fn).not.toHaveBeenCalled();
  });
  it("pede a permissão declarada", async () => {
    await acao("processo.editar", esquema, async () => 1)({ n: 1 });
    expect(permissao).toHaveBeenCalledWith("processo.editar");
  });
  it("entrada inválida: Dados inválidos e fn nunca roda", async () => {
    const fn = vi.fn();
    expect(await acao("processo.ver", esquema, fn)({ n: "x" })).toEqual({ ok: false, erro: "Dados inválidos." });
    expect(await acao("processo.ver", esquema, fn)(undefined)).toEqual({ ok: false, erro: "Dados inválidos." });
    expect(fn).not.toHaveBeenCalled();
  });
  it("fn recebe o dado parseado e o usuário", async () => {
    const fn = vi.fn(async (e: { n: number }) => e.n * 2);
    // Zod descarta chave desconhecida: fn só vê o dado parseado.
    expect(await acao("processo.ver", esquema, fn)({ n: 2, extra: "x" })).toEqual({ ok: true, dados: 4 });
    expect(fn).toHaveBeenCalledWith({ n: 2 }, usuario);
  });
  it("erro de domínio vira mensagem genérica e o log não leva detail", async () => {
    const r = await acao("processo.ver", esquema, async () => {
      throw erroDeBanco();
    })({ n: 1 });
    expect(r).toEqual({ ok: false, erro: GENERICA });
    expect(JSON.stringify(r)).not.toContain("estoque");
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith({ nome: "Error", codigo: "23505" });
    expect(logado()).not.toContain("valor-secreto");
    expect(logado()).not.toContain("estoque");
  });
  it("DrizzleQueryError: nem SQL nem params no log; código vem de cause", async () => {
    const r = await acao("processo.ver", esquema, async () => {
      throw erroDrizzle();
    })({ n: 1 });
    expect(r).toEqual({ ok: false, erro: GENERICA });
    expect(logado()).not.toContain("valor-secreto");
    expect(logado()).not.toContain("insert into");
    expect(log.mock.calls[0][0]).toMatchObject({ codigo: "23505" });
  });
  it("erro do pg com valor na mensagem: o valor não vai ao log", async () => {
    await acao("processo.ver", esquema, async () => {
      throw new Error('invalid input syntax for type uuid: "abc"');
    })({ n: 1 });
    expect(logado()).not.toContain("abc");
  });
  it("ErroDominio: a mensagem vai ao log, o cliente recebe só a genérica", async () => {
    const r = await acao("processo.ver", esquema, async () => {
      throw new ErroDominio("Posição de demanda inválida.");
    })({ n: 1 });
    expect(r).toEqual({ ok: false, erro: GENERICA });
    expect(log).toHaveBeenCalledWith({ nome: "ErroDominio", mensagem: "Posição de demanda inválida." });
  });
  it("throw que não é Error: log só com o tipo", async () => {
    const r = await acao("processo.ver", esquema, async () => {
      throw "valor-secreto";
    })({ n: 1 });
    expect(r).toEqual({ ok: false, erro: GENERICA });
    expect(log).toHaveBeenCalledWith({ nome: "string" });
    expect(logado()).not.toContain("valor-secreto");
  });
  it("log não leva a entrada (parseada ou bruta)", async () => {
    await acao("processo.ver", esquema, async () => {
      throw new Error("falha");
    })({ n: 987654 });
    expect(logado()).not.toContain("987654");
  });
  it("redirect de dentro da fn é relançado, não engolido", async () => {
    const redir = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/x;307;" });
    await expect(
      acao("processo.ver", esquema, async () => {
        throw redir;
      })({ n: 1 }),
    ).rejects.toBe(redir);
    expect(unstable_rethrow).toHaveBeenCalledWith(redir);
    expect(log).not.toHaveBeenCalled();
  });
  // Alteração de teste (era "propaga"): ruling do controller, Minor 4 do review.
  it("erro que não é ErroPermissao vindo de requirePermissao vira genérico, é logado sem valor e fn não roda", async () => {
    permissao.mockRejectedValue(erroDrizzle());
    const fn = vi.fn();
    expect(await acao("processo.ver", esquema, fn)({ n: 1 })).toEqual({ ok: false, erro: GENERICA });
    expect(fn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    expect(logado()).not.toContain("valor-secreto");
  });
  it("redirect vindo de requirePermissao é relançado", async () => {
    const redir = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/x;307;" });
    permissao.mockRejectedValue(redir);
    await expect(acao("processo.ver", esquema, vi.fn())({ n: 1 })).rejects.toBe(redir);
  });
});

describe("acaoPublica", () => {
  it("entrada inválida é recusada e não consulta permissão", async () => {
    const fn = vi.fn();
    expect(await acaoPublica(esquema, fn)({ n: "x" })).toEqual({ ok: false, erro: "Dados inválidos." });
    expect(fn).not.toHaveBeenCalled();
    expect(permissao).not.toHaveBeenCalled();
  });
  it("erro da fn vira mensagem genérica sem vazar detail", async () => {
    const r = await acaoPublica(esquema, async () => {
      throw erroDeBanco();
    })({ n: 1 });
    expect(r).toEqual({ ok: false, erro: GENERICA });
    expect(logado()).not.toContain("valor-secreto");
  });
  it("sucesso devolve os dados", async () => {
    expect(await acaoPublica(esquema, async (e) => e.n)({ n: 7 })).toEqual({ ok: true, dados: 7 });
  });
});

describe("rota", () => {
  const req = new Request("http://x.test/api");
  it("401 sem sessão", async () => {
    permissao.mockRejectedValue(new ErroPermissao(401));
    const handler = vi.fn();
    const res = await rota("processo.ver", handler)(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ erro: "Sessão ausente." });
    expect(handler).not.toHaveBeenCalled();
  });
  it("403 sem permissão", async () => {
    permissao.mockRejectedValue(new ErroPermissao(403));
    const handler = vi.fn();
    const res = await rota("processo.ver", handler)(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ erro: "Sem permissão para esta ação." });
    expect(handler).not.toHaveBeenCalled();
  });
  it("erro do handler: 500 genérico e log sem valores", async () => {
    const res = await rota("processo.ver", async () => {
      throw erroDeBanco();
    })(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ erro: GENERICA });
    expect(log).toHaveBeenCalledWith({ nome: "Error", codigo: "23505" });
    expect(logado()).not.toContain("valor-secreto");
  });
  it("DrizzleQueryError no handler: sem SQL nem params no log", async () => {
    await rota("processo.ver", async () => {
      throw erroDrizzle();
    })(req);
    expect(logado()).not.toContain("valor-secreto");
    expect(log.mock.calls[0][0]).toMatchObject({ codigo: "23505" });
  });
  it("sucesso passa a resposta do handler e entrega req e usuário", async () => {
    const resposta = new Response("ok", { status: 201 });
    const handler = vi.fn(async () => resposta);
    expect(await rota("processo.ver", handler)(req)).toBe(resposta);
    expect(handler).toHaveBeenCalledWith(req, usuario);
  });
  it("redirect do handler é relançado", async () => {
    const redir = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/x;307;" });
    await expect(
      rota("processo.ver", async () => {
        throw redir;
      })(req),
    ).rejects.toBe(redir);
  });
});
