import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./db/schema";
import { bancoDisponivel } from "./db/teste-banco";
import { urlLocal } from "./db/url-local";
import { MENSAGEM_LOGIN_FALHOU } from "../dominio/seguranca/login";
import { CAMINHOS_AUTH_PERMITIDOS, criarAuth, type Auth } from "./auth-config";

// auth.ts importa ./db; aqui o banco é um mock do drizzle (nenhuma query roda nos testes de import).
const h = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("./db", () => ({ db: h.db }));

// Só para teste. O vitest carrega o .env.local: toda variável de auth é sobrescrita aqui.
const SEGREDO = "segredo-de-teste-somente-vitest-0123456789";
const BASE = "https://usinagem.teste.invalid";
const SENHA = "senha-correta-de-teste-123";
const HEADER_IP = "x-real-ip";
const DOZE_HORAS_MS = 12 * 60 * 60 * 1000;
const ERRO_GENERICO = { code: "INVALID_EMAIL_OR_PASSWORD", message: MENSAGEM_LOGIN_FALHOU };

function ambiente(extra: Record<string, string | undefined> = {}) {
  vi.stubEnv("BETTER_AUTH_SECRET", SEGREDO);
  vi.stubEnv("BETTER_AUTH_URL", BASE);
  vi.stubEnv("AUTH_IP_HEADER", HEADER_IP);
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
}

const bancoFalso = () => drizzle.mock({ schema });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("criarAuth: variáveis de ambiente", () => {
  for (const NODE_ENV of ["development", "production"]) {
    for (const [nome, valor] of [
      ["ausente", undefined],
      ["vazio", ""],
      ["só espaços", "      "],
      ["curto", "x".repeat(31)],
      ["com 31 depois do trim", ` ${"x".repeat(31)} `],
    ] as const) {
      it(`${NODE_ENV}: BETTER_AUTH_SECRET ${nome} lança`, () => {
        ambiente({ NODE_ENV, BETTER_AUTH_SECRET: valor });
        expect(() => criarAuth({ banco: bancoFalso() })).toThrow("BETTER_AUTH_SECRET ausente ou curto.");
      });
    }
    it(`${NODE_ENV}: BETTER_AUTH_SECRET com exatamente 32 (também com espaços em volta) inicializa`, () => {
      for (const valor of ["x".repeat(32), `  ${"x".repeat(32)}  `]) {
        ambiente({ NODE_ENV, BETTER_AUTH_SECRET: valor });
        expect(() => criarAuth({ banco: bancoFalso() })).not.toThrow();
      }
    });
  }

  for (const [nome, valor] of [["ausente", undefined], ["vazio", ""], ["só espaços", "   "]] as const) {
    it(`production: AUTH_IP_HEADER ${nome} lança`, () => {
      ambiente({ NODE_ENV: "production", AUTH_IP_HEADER: valor });
      expect(() => criarAuth({ banco: bancoFalso() })).toThrow("AUTH_IP_HEADER ausente em produção.");
    });
    it(`development: AUTH_IP_HEADER ${nome} aceito e nenhum header é confiável`, () => {
      ambiente({ NODE_ENV: "development", AUTH_IP_HEADER: valor });
      const auth = criarAuth({ banco: bancoFalso() });
      // [] e não undefined: undefined faria o Better Auth cair no x-forwarded-for padrão.
      expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toEqual([]);
    });
  }

  it("production: com AUTH_IP_HEADER definido, inicializa e confia só nele", () => {
    ambiente({ NODE_ENV: "production", AUTH_IP_HEADER: ` ${HEADER_IP} ` });
    const auth = criarAuth({ banco: bancoFalso() });
    expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toEqual([HEADER_IP]);
  });
});

describe("auth(): inicialização preguiçosa", () => {
  beforeEach(() => {
    vi.resetModules();
    h.db.mockReset().mockImplementation(bancoFalso);
  });

  it("importar com NODE_ENV=production e sem as variáveis não lança; a primeira chamada lança", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", undefined);
    vi.stubEnv("AUTH_IP_HEADER", undefined);
    const { auth } = await import("./auth");
    expect(h.db).not.toHaveBeenCalled();
    expect(() => auth()).toThrow("BETTER_AUTH_SECRET ausente ou curto.");
    vi.stubEnv("BETTER_AUTH_SECRET", SEGREDO);
    expect(() => auth()).toThrow("AUTH_IP_HEADER ausente em produção.");
  });

  it("depois de inicializada, devolve sempre a mesma instância", async () => {
    ambiente({ NODE_ENV: "production" });
    const { auth } = await import("./auth");
    expect(auth()).toBe(auth());
  });
});

const temBanco = bancoDisponivel();

describe.skipIf(!temBanco)("criarAuth com Postgres local (usuários fictícios)", () => {
  const banco = temBanco ? drizzle(urlLocal(process.env.DATABASE_URL), { schema }) : undefined!;
  afterAll(async () => {
    await banco?.$client.end();
  });

  let auth: Auth;
  beforeEach(() => {
    ambiente();
    auth = criarAuth({ banco });
  });

  // O armazenamento do rate limit é por processo: cada requisição leva um IP próprio para não somar baldes.
  let seq = 0;
  const ipUnico = () => `10.0.${Math.floor(seq / 250)}.${(seq++ % 250) + 1}`;

  async function criarUsuario({ ativo = true } = {}) {
    const ctx = await auth.$context;
    const email = `teste-${randomUUID()}@ficticio.invalid`;
    const u = await ctx.internalAdapter.createUser({ name: "Teste", email, perfilId: "tecnico", ativo, ficticio: true });
    await ctx.internalAdapter.linkAccount({ userId: u.id, providerId: "credential", accountId: u.id, password: await ctx.password.hash(SENHA) });
    return { id: u.id, email };
  }

  const pedido = (caminho: string, init: { method?: string; headers?: Record<string, string>; corpo?: object } = {}) =>
    auth.handler(
      new Request(`${BASE}/api/auth${caminho}`, {
        method: init.method ?? "POST",
        headers: { "content-type": "application/json", ...(init.headers ?? { [HEADER_IP]: ipUnico() }) },
        body: init.method === "GET" ? undefined : JSON.stringify(init.corpo ?? {}),
      }),
    );
  const entrar = (corpo: object, headers?: Record<string, string>) => pedido("/sign-in/email", { corpo, headers });
  const cookieDe = (r: Response) => r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

  const auditoriaDe = (email: string) =>
    banco.select().from(schema.eventosAuditoria).where(sql`${schema.eventosAuditoria.depois}->>'email' = ${email}`);
  const sessoesDe = (usuarioId: string) => banco.select().from(schema.sessoes).where(eq(schema.sessoes.userId, usuarioId));

  it("1. cadastro público recusado", async () => {
    const email = `teste-${randomUUID()}@ficticio.invalid`;
    await expect(auth.api.signUpEmail({ body: { name: "X", email, password: SENHA } })).rejects.toMatchObject({ statusCode: 404 });
    expect(await banco.select().from(schema.usuarios).where(eq(schema.usuarios.email, email))).toHaveLength(0);
  });

  it("2. login certo cria sessão e audita login_sucesso sem a senha", async () => {
    const u = await criarUsuario();
    const r = await auth.api.signInEmail({
      body: { email: u.email.toUpperCase(), password: SENHA },
      headers: new Headers({ [HEADER_IP]: "203.0.113.7", "user-agent": "vitest" }),
    });
    expect(r.token).toBeTruthy();
    expect(await sessoesDe(u.id)).toHaveLength(1);
    const audit = await auditoriaDe(u.email);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ operacao: "login_sucesso", autorId: u.id, entidadeId: u.id });
    expect(audit[0].depois).toEqual({ email: u.email, ip: "203.0.113.7", userAgent: "vitest" });
    expect(JSON.stringify(audit)).not.toContain(SENHA);
  });

  it("3. senha errada audita login_falha sem a senha; e-mail inexistente não grava nada", async () => {
    const u = await criarUsuario();
    const errada = "senha-errada-de-teste-999";
    await expect(auth.api.signInEmail({ body: { email: u.email, password: errada } })).rejects.toMatchObject({ statusCode: 401 });
    const audit = await auditoriaDe(u.email);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ operacao: "login_falha", autorId: u.id });
    expect(JSON.stringify(audit)).not.toContain(errada);

    const inexistente = `teste-${randomUUID()}@ficticio.invalid`;
    await expect(auth.api.signInEmail({ body: { email: inexistente, password: errada } })).rejects.toMatchObject({ statusCode: 401 });
    expect(await auditoriaDe(inexistente)).toHaveLength(0);
  });

  it("4. senha errada, e-mail inexistente e inativo: respostas idênticas e um KDF por tentativa", async () => {
    const ativo = await criarUsuario();
    const inativo = await criarUsuario({ ativo: false });
    const ctx = await auth.$context;
    const verify = vi.spyOn(ctx.password, "verify");
    const hash = vi.spyOn(ctx.password, "hash");
    const tentar = async (corpo: object) => {
      verify.mockClear();
      hash.mockClear();
      const r = await entrar(corpo);
      return { status: r.status, corpo: await r.text(), verify: verify.mock.calls.length, hash: hash.mock.calls.length };
    };
    const senhaErrada = await tentar({ email: ativo.email, password: "senha-errada-de-teste-999" });
    const inexistente = await tentar({ email: `teste-${randomUUID()}@ficticio.invalid`, password: "senha-errada-de-teste-999" });
    const inativoCerta = await tentar({ email: inativo.email, password: SENHA });

    expect(senhaErrada.status).toBe(401);
    expect(JSON.parse(senhaErrada.corpo)).toEqual(ERRO_GENERICO);
    for (const outro of [inexistente, inativoCerta]) {
      expect({ status: outro.status, corpo: outro.corpo }).toEqual({ status: senhaErrada.status, corpo: senhaErrada.corpo });
    }
    // Uma derivação scrypt por tentativa: o Better Auth faz hash da senha recebida quando o usuário não existe.
    expect(senhaErrada).toMatchObject({ verify: 1, hash: 0 });
    expect(inexistente).toMatchObject({ verify: 0, hash: 1 });
    expect(inativoCerta).toMatchObject({ verify: 1, hash: 0 });
  });

  it("5. inativo com a senha certa não recebe sessão e sai com o erro da senha errada", async () => {
    const inativo = await criarUsuario({ ativo: false });
    const ativo = await criarUsuario();
    const erroDe = (p: Promise<unknown>) => p.then(() => null, (e: { statusCode: number; body: unknown }) => ({ statusCode: e.statusCode, body: e.body }));
    const deInativo = await erroDe(auth.api.signInEmail({ body: { email: inativo.email, password: SENHA } }));
    const deSenhaErrada = await erroDe(auth.api.signInEmail({ body: { email: ativo.email, password: "senha-errada-de-teste-999" } }));
    expect(deInativo).toEqual({ statusCode: 401, body: ERRO_GENERICO });
    expect(deInativo).toEqual(deSenhaErrada);
    expect(await sessoesDe(inativo.id)).toHaveLength(0);
  });

  it("6. fixação de sessão: tokens novos a cada login e cookie forjado não vale", async () => {
    const u = await criarUsuario();
    const r1 = await entrar({ email: u.email, password: SENHA });
    const r2 = await entrar({ email: u.email, password: SENHA });
    const [t1, t2] = [(await r1.json()).token, (await r2.json()).token];
    expect(t1).toBeTruthy();
    expect(t1).not.toBe(t2);
    const valida = await auth.api.getSession({ headers: new Headers({ cookie: cookieDe(r1) }) });
    expect(valida?.user.id).toBe(u.id);
    for (const forjado of ["__Secure-usinagem.session_token=forjado", "usinagem.session_token=forjado", `__Secure-usinagem.session_token=${t1}`]) {
      expect(await auth.api.getSession({ headers: new Headers({ cookie: forjado }) })).toBeNull();
    }
  });

  it("7. cookie de sessão HttpOnly, SameSite=Lax, Secure e com prefixo __Secure-usinagem", async () => {
    const u = await criarUsuario();
    const r = await entrar({ email: u.email, password: SENHA });
    expect(r.status).toBe(200);
    const sessao = r.headers.getSetCookie().find((c) => c.startsWith("__Secure-usinagem.session_token="));
    expect(sessao).toBeDefined();
    expect(sessao).toMatch(/;\s*HttpOnly/i);
    expect(sessao).toMatch(/;\s*SameSite=Lax/i);
    expect(sessao).toMatch(/;\s*Secure/i);
  });

  it("8. expiração absoluta de 12 h: getSession depois de 2 h não renova", async () => {
    const u = await criarUsuario();
    const r = await entrar({ email: u.email, password: SENHA });
    const [s] = await sessoesDe(u.id);
    expect(Math.abs(s.expiresAt.getTime() - s.createdAt.getTime() - DOZE_HORAS_MS)).toBeLessThanOrEqual(5000);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
    const lida = await auth.api.getSession({ headers: new Headers({ cookie: cookieDe(r) }) });
    expect(lida?.session.expiresAt.getTime()).toBe(s.expiresAt.getTime());
    const [depois] = await sessoesDe(u.id);
    expect(depois.expiresAt.getTime()).toBe(s.expiresAt.getTime());
    const { options } = await auth.$context;
    // updateAge de 1 h: sem a trava, o getSession de 2 h acima renovaria. A trava é a única coisa que impede.
    expect(options.session?.updateAge).toBe(60 * 60);
    expect(options.session?.disableSessionRefresh).toBe(true);
  });

  it("9. origem: Origin estranha é recusada e a do próprio app passa", async () => {
    const u = await criarUsuario();
    const atacante = await entrar({ email: u.email, password: SENHA }, { [HEADER_IP]: ipUnico(), origin: "https://atacante.invalid" });
    expect(atacante.status).toBe(403);
    expect((await atacante.json()).code).toBe("INVALID_ORIGIN");
    expect(await sessoesDe(u.id)).toHaveLength(0);
    const propria = await entrar({ email: u.email, password: SENHA }, { [HEADER_IP]: ipUnico(), origin: BASE });
    expect(propria.status).toBe(200);
  });

  const cincoSemIpConfiavel: Record<string, string>[] = [
    {},
    { [HEADER_IP]: "lixo" },
    { [HEADER_IP]: "203.0.113.1, 203.0.113.2" },
    { [HEADER_IP]: "" },
    { "x-forwarded-for": "198.51.100.9" },
  ];

  it("10. sem IP confiável todos caem num balde único que também limita (5 por 60 s)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 10 * 60 * 1000);
    const corpo = { email: `teste-${randomUUID()}@ficticio.invalid`, password: "senha-errada-de-teste-999" };
    for (const headers of cincoSemIpConfiavel) expect((await entrar(corpo, headers)).status).toBe(401);
    expect((await entrar(corpo, { [HEADER_IP]: "999.1.1.1" })).status).toBe(429);
    // Um IP válido tem balde próprio.
    expect((await entrar(corpo, { [HEADER_IP]: ipUnico() })).status).toBe(401);
  });

  it("10b. development com AUTH_IP_HEADER vazio: nenhum header vale, nem um IP bem formado", async () => {
    vi.stubEnv("AUTH_IP_HEADER", "");
    auth = criarAuth({ banco });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 20 * 60 * 1000);
    const corpo = { email: `teste-${randomUUID()}@ficticio.invalid`, password: "senha-errada-de-teste-999" };
    for (let i = 0; i < 5; i++) expect((await entrar(corpo, { [HEADER_IP]: ipUnico(), "x-forwarded-for": ipUnico() })).status).toBe(401);
    expect((await entrar(corpo, { [HEADER_IP]: ipUnico(), "x-forwarded-for": ipUnico() })).status).toBe(429);
  });

  it("allowlist na fábrica: só os 3 caminhos respondem", async () => {
    expect(CAMINHOS_AUTH_PERMITIDOS).toEqual(["/sign-in/email", "/sign-out", "/get-session"]);
    const corpoCadastro = { name: "X", email: `teste-${randomUUID()}@ficticio.invalid`, password: SENHA };
    for (const [caminho, method] of [
      ["/sign-up/email", "POST"],
      ["/update-user", "POST"],
      ["/change-password", "POST"],
      ["/delete-user", "POST"],
      ["/list-sessions", "GET"],
      ["/request-password-reset", "POST"],
    ] as const) {
      expect({ caminho, status: (await pedido(caminho, { method, corpo: corpoCadastro })).status }).toEqual({ caminho, status: 404 });
    }
    const permitidos = [
      await entrar({ email: `teste-${randomUUID()}@ficticio.invalid`, password: "senha-errada-de-teste-999" }),
      await pedido("/sign-out"),
      await pedido("/get-session", { method: "GET" }),
    ];
    for (const r of permitidos) expect(r.status).not.toBe(404);
  });
});
