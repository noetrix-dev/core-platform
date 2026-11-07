import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { z } from "zod";
import * as schema from "./db/schema";
import { bancoDisponivel } from "./db/teste-banco";
import { urlLocal } from "./db/url-local";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({
  usuario: null as unknown,
  rows: [] as { p: string }[],
  db: vi.fn(),
  getSession: vi.fn(),
  usuarioDev: vi.fn(),
  importsDev: 0,
}));
// Conta as importações: o ramo de dev nem carrega o módulo fora do gate.
vi.mock("./sessao-dev", () => {
  h.importsDev++;
  return { usuarioDev: h.usuarioDev };
});
vi.mock("./db", () => ({ db: h.db }));
vi.mock("./auth", () => ({ auth: () => ({ api: { getSession: h.getSession } }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { criarAuth } from "./auth-config";
import { acaoSensivel } from "./acao";
import { ErroPermissao, ErroReautenticacao, requirePermissao, requirePermissaoSensivel, usuarioAtual } from "./sessao";
import { criarUsuarioComSenha, redefinirSenha } from "./usuarios-auth";

const compras = { id: "u3", nome: "Compras", perfil: "compras_producao" as const };
const MIN = 60 * 1000;

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("ENABLE_DEV_SWITCHER", "1");
  h.usuario = compras;
  h.rows = [];
  h.getSession.mockReset().mockResolvedValue(null);
  h.usuarioDev.mockReset().mockImplementation(async () => h.usuario);
  h.db.mockReset().mockImplementation(() => ({ select: () => ({ from: () => ({ where: async () => h.rows }) }) }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// Alteração de teste: o objeto esperado ganhou `sessaoCriadaEm: null` (seletor de dev); nenhuma expectativa mudou.
describe("requirePermissao", () => {
  it("devolve o usuário com as mesmas concedidas que usou na decisão", async () => {
    h.rows = [{ p: "processo.ver" }, { p: "custo.ver" }];
    expect(await requirePermissao("custo.ver")).toEqual({ ...compras, concedidas: ["processo.ver", "custo.ver"], sessaoCriadaEm: null });
  });
  it("revogação: sem a linha no banco a ação é negada, mesmo com a matriz padrão concedendo", async () => {
    h.rows = [{ p: "processo.ver" }];
    await expect(requirePermissao("custo.ver")).rejects.toMatchObject({ status: 403 });
  });
  it("tabela vazia (seed não rodado): nega não-admin e devolve concedidas vazias ao Admin", async () => {
    await expect(requirePermissao("processo.ver")).rejects.toBeInstanceOf(ErroPermissao);
    h.usuario = { id: "u1", nome: "Adm", perfil: "admin" };
    expect(await requirePermissao("processo.ver")).toEqual({ id: "u1", nome: "Adm", perfil: "admin", concedidas: [], sessaoCriadaEm: null });
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

describe("seletor de dev (sem sessão real)", () => {
  it("4. gate ligado: usuário de dev com sessaoCriadaEm null", async () => {
    expect(await usuarioAtual()).toEqual({ ...compras, sessaoCriadaEm: null });
  });
  it("3. fora do gate (development sem ENABLE_DEV_SWITCHER=1): 401 e o cookie de dev é ignorado", async () => {
    vi.stubEnv("ENABLE_DEV_SWITCHER", "0");
    expect(await usuarioAtual()).toBeNull();
    await expect(requirePermissao("processo.ver")).rejects.toMatchObject({ status: 401 });
    expect(h.usuarioDev).not.toHaveBeenCalled();
  });
  it.each([["production"], ["test"], [undefined]])(
    "9. NODE_ENV %j com ENABLE_DEV_SWITCHER=1 e cookie de dev válido: null, 401 e sessao-dev nem é importado",
    async (nodeEnv) => {
      vi.resetModules();
      h.importsDev = 0;
      vi.stubEnv("NODE_ENV", nodeEnv);
      const sessao = await import("./sessao");
      expect(await sessao.usuarioAtual()).toBeNull();
      await expect(sessao.requirePermissao("processo.ver")).rejects.toMatchObject({ status: 401 });
      expect(h.importsDev).toBe(0);
      expect(h.usuarioDev).not.toHaveBeenCalled();
    },
  );
  it("6c. requirePermissaoSensivel com o seletor de dev: ErroReautenticacao (403), mesmo para Admin", async () => {
    h.usuario = { id: "u1", nome: "Adm", perfil: "admin" };
    const erro = await requirePermissaoSensivel("processo.ver").catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroReautenticacao);
    expect(erro).toBeInstanceOf(ErroPermissao);
    expect(erro).toMatchObject({ status: 403, message: "Confirme sua senha para continuar." });
  });
});

const temBanco = bancoDisponivel();

describe.skipIf(!temBanco)("sessão real (Postgres local, tudo em transação revertida)", () => {
  const banco = temBanco ? drizzle(urlLocal(process.env.DATABASE_URL), { schema }) : undefined!;
  afterAll(async () => {
    await banco?.$client.end();
  });
  type Tx = Parameters<Parameters<typeof banco.transaction>[0]>[0];

  // Nada é gravado: cada teste roda numa transação que sempre termina em rollback (inclusive UPDATE e DELETE).
  const REVERTER = new Error("reverter");
  async function emTransacao(fn: (tx: Tx) => Promise<void>) {
    const r = await banco
      .transaction(async (tx) => {
        h.db.mockReset().mockReturnValue(tx);
        await fn(tx);
        throw REVERTER;
      })
      .catch((e: unknown) => e);
    if (r !== REVERTER) throw r;
  }

  async function usuario(tx: Tx, { ativo = true, senhaTrocadaEm = new Date(Date.now() - 60 * MIN), credencial = true } = {}) {
    const [u] = await tx
      .insert(schema.usuarios)
      .values({ nome: "[FICTÍCIO] Sessão", email: `teste-${randomUUID()}@ficticio.invalid`, perfilId: "tecnico", ativo, ficticio: true })
      .returning({ id: schema.usuarios.id, nome: schema.usuarios.nome, perfil: schema.usuarios.perfilId });
    if (credencial) await tx.insert(schema.contas).values({ providerId: "credential", accountId: u.id, userId: u.id, password: "hash-ficticio", updatedAt: senhaTrocadaEm });
    return u;
  }
  const sessaoDe = (u: { id: string }, criadaEm: Date) => ({ session: { userId: u.id, createdAt: criadaEm }, user: { id: u.id } });
  const concedidasDe = async (tx: Tx, perfil: string) =>
    (await tx.select({ p: schema.perfilPermissoes.permissao }).from(schema.perfilPermissoes).where(eq(schema.perfilPermissoes.perfilId, perfil))).map((r) => r.p);

  it("1. sessão real de usuário ativo: concedidas de perfil_permissoes e sessaoCriadaEm de session.createdAt", async () => {
    await emTransacao(async (tx) => {
      const u = await usuario(tx);
      const criadaEm = new Date(Date.now() - 2 * MIN);
      h.getSession.mockResolvedValue(sessaoDe(u, criadaEm));
      const concedidas = await concedidasDe(tx, "tecnico");
      expect(concedidas.length).toBeGreaterThan(0); // anti-vácuo: o seed concede algo ao técnico
      const s = await requirePermissao(concedidas[0] as never);
      expect(s).toEqual({ id: u.id, nome: u.nome, perfil: "tecnico", concedidas: expect.arrayContaining(concedidas), sessaoCriadaEm: criadaEm });
      expect(s.concedidas).toHaveLength(concedidas.length);
      expect(h.usuarioDev).not.toHaveBeenCalled();
    });
  });

  it("2. usuário desativado no banco: null e 401 já na leitura seguinte (sem cache)", async () => {
    await emTransacao(async (tx) => {
      const u = await usuario(tx);
      h.getSession.mockResolvedValue(sessaoDe(u, new Date(Date.now() - MIN)));
      expect(await usuarioAtual()).toMatchObject({ id: u.id });
      await tx.update(schema.usuarios).set({ ativo: false }).where(eq(schema.usuarios.id, u.id));
      expect(await usuarioAtual()).toBeNull();
      await expect(requirePermissao("processo.ver")).rejects.toMatchObject({ status: 401 });
      // Sessão real recusada não cai no seletor de dev, mesmo com o gate ligado.
      expect(h.usuarioDev).not.toHaveBeenCalled();
    });
  });

  it("5. sessão real e cookie de dev ao mesmo tempo: vence a real, o seletor nem é chamado", async () => {
    await emTransacao(async (tx) => {
      const u = await usuario(tx);
      h.getSession.mockResolvedValue(sessaoDe(u, new Date(Date.now() - MIN)));
      expect(await usuarioAtual()).toMatchObject({ id: u.id, perfil: "tecnico" });
      expect(h.usuarioDev).not.toHaveBeenCalled();
    });
  });

  it("sessão criada antes (ou no mesmo instante) da última troca de senha: null e 401", async () => {
    await emTransacao(async (tx) => {
      const trocada = new Date(Date.now() - 5 * MIN);
      const u = await usuario(tx, { senhaTrocadaEm: trocada });
      for (const criadaEm of [new Date(trocada.getTime() - 1), trocada]) {
        h.getSession.mockResolvedValue(sessaoDe(u, criadaEm));
        expect(await usuarioAtual()).toBeNull();
        await expect(requirePermissao("processo.ver")).rejects.toMatchObject({ status: 401 });
      }
      h.getSession.mockResolvedValue(sessaoDe(u, new Date(trocada.getTime() + 1)));
      expect(await usuarioAtual()).toMatchObject({ id: u.id });
    });
  });

  it("usuário sem conta credential: null (falha fechado)", async () => {
    await emTransacao(async (tx) => {
      const u = await usuario(tx, { credencial: false });
      h.getSession.mockResolvedValue(sessaoDe(u, new Date()));
      expect(await usuarioAtual()).toBeNull();
    });
  });

  it("6. requirePermissaoSensivel: sessão de 5 min passa; de 11 min lança ErroReautenticacao", async () => {
    await emTransacao(async (tx) => {
      const u = await usuario(tx);
      const [p] = await concedidasDe(tx, "tecnico");
      h.getSession.mockResolvedValue(sessaoDe(u, new Date(Date.now() - 5 * MIN)));
      expect(await requirePermissaoSensivel(p as never)).toMatchObject({ id: u.id });
      h.getSession.mockResolvedValue(sessaoDe(u, new Date(Date.now() - 11 * MIN)));
      const erro = await requirePermissaoSensivel(p as never).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ErroReautenticacao);
      expect(erro).toMatchObject({ status: 403, message: "Confirme sua senha para continuar." });
    });
  });

  it("7. acaoSensivel com sessão velha: { ok: false, erro } e a fn não roda; com sessão recente roda", async () => {
    await emTransacao(async (tx) => {
      const u = await usuario(tx);
      const [p] = await concedidasDe(tx, "tecnico");
      const fn = vi.fn(async () => 1);
      const sensivel = acaoSensivel(p as never, z.object({}), fn);
      h.getSession.mockResolvedValue(sessaoDe(u, new Date(Date.now() - 11 * MIN)));
      expect(await sensivel({})).toEqual({ ok: false, erro: "Confirme sua senha para continuar." });
      expect(fn).not.toHaveBeenCalled();
      h.getSession.mockResolvedValue(sessaoDe(u, new Date(Date.now() - 5 * MIN)));
      expect(await sensivel({})).toEqual({ ok: true, dados: 1 });
    });
  });

  describe("login real (Better Auth sobre a transação)", () => {
    const BASE = "https://usinagem.teste.invalid";
    const SENHA = "senha-correta-de-teste-123";
    const NOVA = "senha-nova-de-teste-4567";
    beforeEach(() => {
      vi.stubEnv("BETTER_AUTH_SECRET", "segredo-de-teste-somente-vitest-0123456789");
      vi.stubEnv("BETTER_AUTH_URL", BASE);
      vi.stubEnv("AUTH_IP_HEADER", "x-real-ip");
    });

    async function preparar(tx: Tx) {
      const auth = criarAuth({ banco: tx });
      const ctx = await auth.$context;
      const email = `teste-${randomUUID()}@ficticio.invalid`;
      const id = await criarUsuarioComSenha(tx, (s) => ctx.password.hash(s), {
        nome: "[FICTÍCIO] Login",
        email,
        senha: SENHA,
        perfil: "tecnico",
        ficticio: true,
        criadoPor: null,
        operador: null,
      });
      const entrar = async () => {
        const r = await auth.api.signInEmail({ body: { email, password: SENHA }, headers: new Headers({ "x-real-ip": "203.0.113.9" }), returnHeaders: true });
        return { token: r.response.token, cookie: r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
      };
      // Leitura de usuarioAtual direto da linha da sessão (sem os hooks do /get-session): prova a checagem de sessao.ts sozinha.
      const lerPeloToken = (token: string) => h.getSession.mockImplementation(() => ctx.internalAdapter.findSession(token));
      const lerPeloEndpoint = (cookie: string) => auth.api.getSession({ headers: new Headers({ cookie }) });
      const senhaTrocadaEm = async () =>
        (await tx.select({ em: schema.contas.updatedAt }).from(schema.contas).where(eq(schema.contas.userId, id)))[0].em;
      return { auth, ctx, email, id, entrar, lerPeloToken, lerPeloEndpoint, senhaTrocadaEm };
    }

    it("corrida: login que leu o hash antigo e grava a sessão depois da redefinição tem a sessão recusada", async () => {
      await emTransacao(async (tx) => {
        const { ctx, email, id, entrar, lerPeloToken, lerPeloEndpoint, senhaTrocadaEm } = await preparar(tx);
        const verificar = ctx.password.verify;
        let soltar!: () => void;
        const liberado = new Promise<void>((r) => (soltar = r));
        let avisar!: () => void;
        const chegouNoVerify = new Promise<void>((r) => (avisar = r));
        vi.spyOn(ctx.password, "verify").mockImplementation(async (a) => {
          avisar();
          await liberado;
          return verificar(a);
        });

        const login = entrar();
        await chegouNoVerify; // o Better Auth já leu o hash antigo (sign-in.mjs:287) e está no scrypt
        const antes = Date.now();
        expect(await redefinirSenha(tx, (s) => ctx.password.hash(s), { email, novaSenha: NOVA, operador: null })).toBe(true);
        const trocada = await senhaTrocadaEm();
        // Relógio do app: o atualizado_em é o instante da redefinição, não o now() do banco (que é o início da transação).
        expect(trocada.getTime()).toBeGreaterThanOrEqual(antes);
        soltar();
        const { token, cookie } = await login;

        // A sessão foi gravada depois do DELETE da redefinição: a corrida aconteceu.
        const [s] = await tx.select().from(schema.sessoes).where(eq(schema.sessoes.token, token));
        expect(s.userId).toBe(id);

        lerPeloToken(token);
        expect(await usuarioAtual()).toBeNull();
        await expect(requirePermissao("processo.ver")).rejects.toMatchObject({ status: 401 });
        expect(await lerPeloEndpoint(cookie)).toBeNull();
        // Por quê: o createdAt é o carimbo do início do login, anterior à troca de senha.
        expect(s.createdAt.getTime()).toBeLessThan(trocada.getTime());
      });
    });

    it("login normal não mexe em contas.atualizado_em e a sessão nova é aceita (sessão real e /get-session)", async () => {
      await emTransacao(async (tx) => {
        const { id, entrar, lerPeloToken, lerPeloEndpoint, senhaTrocadaEm } = await preparar(tx);
        const antes = await senhaTrocadaEm();
        const { token, cookie } = await entrar();
        expect((await senhaTrocadaEm()).getTime()).toBe(antes.getTime());
        lerPeloToken(token);
        expect(await usuarioAtual()).toMatchObject({ id });
        expect((await lerPeloEndpoint(cookie))?.user.id).toBe(id);
      });
    });

    it("relógio do banco adiantado em relação ao app: login logo depois da criação é aceito (atualizado_em da criação no relógio do app)", async () => {
      await emTransacao(async (tx) => {
        // A transação já começou: o now() do banco (início da transação) fica 5 min À FRENTE do relógio do app daqui em diante.
        // shouldAdvanceTime: relógio parado deixaria criação e login no mesmo instante, que conta como anterior (recusa).
        vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
        vi.setSystemTime(Date.now() - 5 * MIN);
        try {
          const criadoNoApp = Date.now();
          const { id, entrar, lerPeloToken, lerPeloEndpoint, senhaTrocadaEm } = await preparar(tx);
          const { token, cookie } = await entrar();
          lerPeloToken(token);
          expect(await usuarioAtual()).toMatchObject({ id });
          expect((await lerPeloEndpoint(cookie))?.user.id).toBe(id);
          // Por quê: o atualizado_em da conta nova vem do relógio do app (não do now() do banco), antes do carimbo do login.
          expect((await senhaTrocadaEm()).getTime()).toBeGreaterThanOrEqual(criadoNoApp);
        } finally {
          vi.useRealTimers();
        }
      });
    });

    it("createdAt da sessão é o início do login; o teto de 12 h conta da criação real", async () => {
      await emTransacao(async (tx) => {
        const { ctx, id, entrar } = await preparar(tx);
        const verificar = ctx.password.verify;
        // Login lento: 300 ms entre o início e a criação da sessão.
        vi.spyOn(ctx.password, "verify").mockImplementation(async (a) => {
          await new Promise((r) => setTimeout(r, 300));
          return verificar(a);
        });
        const inicio = Date.now();
        await entrar();
        const fim = Date.now();
        const [s] = await tx.select().from(schema.sessoes).where(eq(schema.sessoes.userId, id));
        expect(s.createdAt.getTime()).toBeGreaterThanOrEqual(inicio);
        expect(s.createdAt.getTime()).toBeLessThan(inicio + 300);
        expect(s.expiresAt.getTime()).toBeGreaterThanOrEqual(inicio + 300 + 12 * 60 * MIN);
        expect(s.expiresAt.getTime()).toBeLessThanOrEqual(fim + 12 * 60 * MIN);
      });
    });

    it("/get-session devolve sessão nula para usuário inativo e para sessão obsoleta", async () => {
      await emTransacao(async (tx) => {
        const { id, entrar, lerPeloEndpoint } = await preparar(tx);
        const inativo = await entrar();
        expect((await lerPeloEndpoint(inativo.cookie))?.user.id).toBe(id);
        await tx.update(schema.usuarios).set({ ativo: false }).where(eq(schema.usuarios.id, id));
        expect(await lerPeloEndpoint(inativo.cookie)).toBeNull();
        await tx.update(schema.usuarios).set({ ativo: true }).where(eq(schema.usuarios.id, id));

        const obsoleta = await entrar();
        expect((await lerPeloEndpoint(obsoleta.cookie))?.user.id).toBe(id);
        // Troca de senha registrada depois da sessão, sem o DELETE das sessões: só a checagem do hook a derruba.
        await tx.update(schema.contas).set({ updatedAt: new Date(Date.now() + 1000) }).where(eq(schema.contas.userId, id));
        expect(await lerPeloEndpoint(obsoleta.cookie)).toBeNull();
      });
    });
  });
});
