import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MENSAGEM_LOGIN_FALHOU } from "../dominio/seguranca/login";

// Tela /entrar testada daqui: o vitest só inclui lib/** e scripts/**. Sem biblioteca de DOM instalada, o formulário
// é testado pela função `entrarComSenha` que ele chama, e a página (Server Component) é chamada como função.
vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({ usuario: null as unknown, cookie: "", redirect: vi.fn() }));
vi.mock("./sessao", () => ({ usuarioAtual: async () => h.usuario }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(h.cookie ? { cookie: h.cookie } : {}),
  cookies: async () => ({ has: (n: string) => h.cookie.includes(`${n}=`), get: (n: string) => (h.cookie.includes(`${n}=`) ? { name: n, value: "x" } : undefined) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    h.redirect(url);
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock("../../app/entrar/FormEntrar", () => ({ FormEntrar: () => null }));

import Entrar from "../../app/entrar/page";
import { FormEntrar } from "../../app/entrar/FormEntrar";
import { entrarComSenha, type ClienteAuth } from "./auth-cliente";

const COOKIE_OBSOLETO = "usinagem.session_token=token-de-sessao-obsoleta.assinatura";
const pagina = (sp: Record<string, string | string[]> = {}) => Entrar({ searchParams: Promise.resolve(sp), params: Promise.resolve({}) } as never);

/** Acha o elemento do formulário na árvore devolvida (sem renderizar). */
function propsDoForm(no: unknown): { reautenticar: boolean; volta: string } | undefined {
  if (!no || typeof no !== "object") return undefined;
  const el = no as { type?: unknown; props?: { children?: unknown } & Record<string, unknown> };
  if (el.type === FormEntrar) return el.props as never;
  const filhos = el.props?.children;
  for (const f of Array.isArray(filhos) ? filhos : [filhos]) {
    const achado = propsDoForm(f);
    if (achado) return achado;
  }
  return undefined;
}

beforeEach(() => {
  h.usuario = null;
  h.cookie = "";
  h.redirect.mockReset();
});

describe("/entrar (página)", () => {
  it("cookie de sessão presente, sessão recusada (obsoleta ou inativa): mostra o formulário, sem redirecionar", async () => {
    h.cookie = COOKIE_OBSOLETO;
    const arvore = await pagina({ volta: "/processos" });
    expect(h.redirect).not.toHaveBeenCalled();
    expect(propsDoForm(arvore)).toEqual({ reautenticar: false, volta: "/processos" });
  });
  it("sem cookie: mostra o formulário", async () => {
    expect(propsDoForm(await pagina())).toEqual({ reautenticar: false, volta: "/" });
    expect(h.redirect).not.toHaveBeenCalled();
  });
  it("usuário válido: redireciona para o destino seguro", async () => {
    h.cookie = "usinagem.session_token=valido";
    h.usuario = { id: "u1", nome: "A", perfil: "admin", sessaoCriadaEm: new Date() };
    await expect(pagina({ volta: "/processos" })).rejects.toThrow("NEXT_REDIRECT");
    expect(h.redirect).toHaveBeenCalledWith("/processos");
  });
  it("usuário válido com volta perigosa: redireciona para /", async () => {
    h.usuario = { id: "u1", nome: "A", perfil: "admin", sessaoCriadaEm: new Date() };
    await expect(pagina({ volta: "//atacante.invalid" })).rejects.toThrow("NEXT_REDIRECT");
    expect(h.redirect).toHaveBeenCalledWith("/");
  });
  it("reautenticar=1 com usuário válido: mostra o formulário (é o caminho da ação sensível)", async () => {
    h.cookie = "usinagem.session_token=valido";
    h.usuario = { id: "u1", nome: "A", perfil: "admin", sessaoCriadaEm: new Date() };
    expect(propsDoForm(await pagina({ reautenticar: "1", volta: "/x?y=1" }))).toEqual({ reautenticar: true, volta: "/x?y=1" });
    expect(h.redirect).not.toHaveBeenCalled();
  });
  it("parâmetros repetidos (array) viram destino / e sem reautenticar", async () => {
    expect(propsDoForm(await pagina({ volta: ["/a", "/b"], reautenticar: ["1", "1"] }))).toEqual({ reautenticar: false, volta: "/" });
  });
});

describe("entrarComSenha (formulário)", () => {
  const chamadas: string[] = [];
  let signIn: ReturnType<typeof vi.fn>;
  let signOut: ReturnType<typeof vi.fn>;
  let navegar: ReturnType<typeof vi.fn<(destino: string) => void>>;
  const cliente = () => ({ signIn: { email: signIn }, signOut }) as unknown as ClienteAuth;
  const DADOS = { email: "a@x.invalid", senha: "senha-correta-12" };

  beforeEach(() => {
    chamadas.length = 0;
    signIn = vi.fn(async (corpo: unknown) => (chamadas.push(`signIn ${JSON.stringify(corpo)}`), { data: { redirect: false, token: "t" }, error: null }));
    signOut = vi.fn(async () => (chamadas.push("signOut"), { data: { success: true }, error: null }));
    navegar = vi.fn((d: string) => void chamadas.push(`navegar ${d}`));
  });
  afterEach(() => vi.restoreAllMocks());

  it("login normal: só signIn, sem callbackURL, depois navega para o destino seguro", async () => {
    expect(await entrarComSenha({ ...DADOS, reautenticar: false, volta: "/processos" }, cliente(), navegar)).toBeNull();
    expect(chamadas).toEqual([`signIn ${JSON.stringify({ email: DADOS.email, password: DADOS.senha })}`, "navegar /processos"]);
  });
  it("reautenticar: signOut antes do signIn, depois navega", async () => {
    expect(await entrarComSenha({ ...DADOS, reautenticar: true, volta: "/x?y=1" }, cliente(), navegar)).toBeNull();
    expect(chamadas).toEqual(["signOut", `signIn ${JSON.stringify({ email: DADOS.email, password: DADOS.senha })}`, "navegar /x?y=1"]);
  });
  it.each(["//atacante.invalid", "https://atacante.invalid", "/entrar", "/api/auth/sign-out", undefined])("destino passa por destinoSeguro: %j vira /", async (volta) => {
    await entrarComSenha({ ...DADOS, reautenticar: false, volta }, cliente(), navegar);
    expect(navegar).toHaveBeenCalledWith("/");
  });
  it("erro do servidor no signIn: só a mensagem genérica, sem navegar", async () => {
    signIn.mockResolvedValue({ data: null, error: { status: 429, message: "Too many requests. Detalhe interno x@y", code: "RATE" } });
    expect(await entrarComSenha({ ...DADOS, reautenticar: false, volta: "/" }, cliente(), navegar)).toBe(MENSAGEM_LOGIN_FALHOU);
    expect(navegar).not.toHaveBeenCalled();
  });
  it("signIn lança (rede): mensagem genérica", async () => {
    signIn.mockRejectedValue(new Error("Failed to fetch interno"));
    expect(await entrarComSenha({ ...DADOS, reautenticar: false, volta: "/" }, cliente(), navegar)).toBe(MENSAGEM_LOGIN_FALHOU);
    expect(navegar).not.toHaveBeenCalled();
  });
  it("signIn sem erro e sem dados: mensagem genérica (falha fechado)", async () => {
    signIn.mockResolvedValue({ data: null, error: null });
    expect(await entrarComSenha({ ...DADOS, reautenticar: false, volta: "/" }, cliente(), navegar)).toBe(MENSAGEM_LOGIN_FALHOU);
    expect(navegar).not.toHaveBeenCalled();
  });
  it("reautenticar com signOut falhando: mensagem genérica, não tenta o signIn", async () => {
    signOut.mockResolvedValue({ data: null, error: { status: 500, message: "db caiu" } });
    expect(await entrarComSenha({ ...DADOS, reautenticar: true, volta: "/" }, cliente(), navegar)).toBe(MENSAGEM_LOGIN_FALHOU);
    expect(signIn).not.toHaveBeenCalled();
    expect(navegar).not.toHaveBeenCalled();
  });
  it("reautenticar com signOut lançando: mensagem genérica", async () => {
    signOut.mockRejectedValue(new Error("rede"));
    expect(await entrarComSenha({ ...DADOS, reautenticar: true, volta: "/" }, cliente(), navegar)).toBe(MENSAGEM_LOGIN_FALHOU);
    expect(signIn).not.toHaveBeenCalled();
  });
});
