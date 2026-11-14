import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./db/schema";
import { bancoDisponivel } from "./db/teste-banco";
import { urlLocal } from "./db/url-local";
import { criarUsuarioComSenha, desbloquearUsuario, operadorValido, redefinirSenha } from "./usuarios-auth";
import { criarAuth, usuarioDaSessao } from "./auth-config";
import { ehMensagemDeDominio, ErroDominio } from "../dominio/comum";
import type { Perfil } from "../dominio/permissoes/perfis";
import { main } from "../../scripts/desbloquear-usuario";
import { main as criarPorScript } from "../../scripts/criar-usuario";
import { main as redefinirPorScript } from "../../scripts/redefinir-senha";
import { mensagemDeErro, MSG_DUPLICADO, MSG_PERFIL } from "../../scripts/operacao";

const temBanco = bancoDisponivel();

/** Guarda dos testes que commitam uma redefinição: o alvo tem que ser fictício. Lança antes de qualquer escrita. */
function exigeAlvoFicticio(email: string): void {
  if (!email.trim().toLowerCase().endsWith("@ficticio.invalid")) throw new Error("Alvo de redefinição fora de @ficticio.invalid.");
}

describe("exigeAlvoFicticio", () => {
  it("e-mail fictício passa, também com espaços e maiúsculas", () => {
    expect(() => exigeAlvoFicticio("teste-1@ficticio.invalid")).not.toThrow();
    expect(() => exigeAlvoFicticio("  Teste-1@FICTICIO.Invalid ")).not.toThrow();
  });
  it.each(["x@empresa.com.br", "x@ficticio.invalid.com", "x@ficticio.invalido", ""])("%j lança", (email) => {
    expect(() => exigeAlvoFicticio(email)).toThrow("Alvo de redefinição fora de @ficticio.invalid.");
  });
});

describe.skipIf(!temBanco)("desbloquearUsuario e script de operação (Postgres local)", () => {
  const banco = temBanco ? drizzle(urlLocal(process.env.DATABASE_URL), { schema }) : undefined!;
  afterAll(async () => {
    await banco?.$client.end();
  });

  const criarUsuario = async () => {
    const email = `teste-${randomUUID()}@ficticio.invalid`;
    const [u] = await banco.insert(schema.usuarios).values({ nome: "[FICTÍCIO] Teste", email, perfilId: "tecnico", ficticio: true }).returning({ id: schema.usuarios.id });
    return { id: u.id, email };
  };
  const desbloqueiosDe = (email: string) =>
    banco
      .select()
      .from(schema.eventosAuditoria)
      .where(sql`${schema.eventosAuditoria.operacao} = 'login_desbloqueio' and ${schema.eventosAuditoria.depois}->>'email' = ${email}`);
  const contarDesbloqueios = async () =>
    (await banco.select({ n: sql<number>`count(*)::int` }).from(schema.eventosAuditoria).where(eq(schema.eventosAuditoria.operacao, "login_desbloqueio")))[0].n;

  it("grava login_desbloqueio do usuário, sem autor, com o e-mail normalizado", async () => {
    const u = await criarUsuario();
    expect(await desbloquearUsuario(banco, `  ${u.email.toUpperCase()} `)).toBe(true);
    const linhas = await desbloqueiosDe(u.email);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      operacao: "login_desbloqueio",
      entidade: "usuarios",
      entidadeId: u.id,
      autorId: null,
      antes: null,
      depois: { email: u.email },
      justificativa: "desbloqueio pelo script de operação",
    });
  });

  it.each([["inexistente", () => `teste-${randomUUID()}@ficticio.invalid`], ["inválido", () => "nao-e-email"], ["vazio", () => ""]])(
    "e-mail %s devolve false e não grava nada",
    async (_n, email) => {
      const antes = await contarDesbloqueios();
      expect(await desbloquearUsuario(banco, email())).toBe(false);
      expect(await contarDesbloqueios()).toBe(antes);
    },
  );

  it("script: sucesso imprime só Desbloqueado.; erro sai 1 com mensagem genérica, nunca ecoa o argumento", async () => {
    const u = await criarUsuario();
    const saida: string[] = [];
    const deps = { banco, log: (m: string) => saida.push(`log:${m}`), erro: (m: string) => saida.push(`erro:${m}`) };
    expect(await main([u.email], deps)).toBe(0);
    const segredo = `segredo-${randomUUID()}@ficticio.invalid`;
    for (const argv of [[segredo], ["nao-e-email"], [], [u.email, "extra"]]) expect(await main(argv, deps)).toBe(1);
    expect(saida).toEqual(["log:Desbloqueado.", ...Array(4).fill("erro:E-mail inválido ou não encontrado.")]);
    expect(saida.join("\n")).not.toContain(segredo);
    expect(saida.join("\n")).not.toContain(u.email);
  });

  it("script: não escreve nada no console por conta própria", async () => {
    const espioes = (["log", "error", "warn", "info"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    await main([`teste-${randomUUID()}@ficticio.invalid`], { banco, log: () => {}, erro: () => {} });
    for (const e of espioes) expect(e).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe("operadorValido", () => {
  it("só nome de usuário Unix simples; o resto vira null", () => {
    expect(operadorValido("root")).toBe("root");
    expect(operadorValido("_op-1")).toBe("_op-1");
    for (const n of ["Ewerton", "a;rm -rf", "", "1abc", "a".repeat(33), null, undefined, 7]) expect(operadorValido(n)).toBeNull();
    expect(operadorValido("a".repeat(32))).toBe("a".repeat(32));
  });
});

describe.skipIf(!temBanco)("criação e redefinição de senha (Postgres local)", () => {
  const banco = temBanco ? drizzle(urlLocal(process.env.DATABASE_URL), { schema }) : undefined!;
  afterAll(async () => {
    await banco?.$client.end();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const SENHA = "senha-inicial-de-teste-123";
  const NOVA = "senha-nova-de-teste-456789";
  const novoAuth = () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "segredo-de-teste-somente-vitest-0123456789");
    vi.stubEnv("BETTER_AUTH_URL", "https://usinagem.teste.invalid");
    vi.stubEnv("AUTH_IP_HEADER", "x-real-ip");
    return criarAuth({ banco });
  };
  const hashReal = async (s: string) => (await novoAuth().$context).password.hash(s);
  const novoEmail = () => `teste-${randomUUID()}@ficticio.invalid`;
  const dados = (o: Partial<Parameters<typeof criarUsuarioComSenha>[2]> = {}) => ({
    nome: "[FICTÍCIO] Operador",
    email: novoEmail(),
    senha: SENHA,
    perfil: "tecnico" as Perfil,
    ficticio: true,
    criadoPor: null,
    operador: "operador_teste",
    ...o,
  });
  const usuariosCom = (email: string) => banco.select().from(schema.usuarios).where(eq(schema.usuarios.email, email.trim().toLowerCase()));
  const contasDe = (id: string) => banco.select().from(schema.contas).where(eq(schema.contas.userId, id));
  const eventos = (id: string, operacao: string) =>
    banco.select().from(schema.eventosAuditoria).where(sql`${schema.eventosAuditoria.entidadeId} = ${id} and ${schema.eventosAuditoria.operacao} = ${operacao}`);
  const entrar = (email: string, password: string) => novoAuth().api.signInEmail({ body: { email, password }, returnHeaders: true });
  const cookieDe = (h: Headers) => h.getSetCookie().map((c) => c.split(";")[0]).join("; ");

  it("cria usuário, conta credential com hash scrypt e evento usuario_criado sem a senha", async () => {
    const d = dados({ email: `  ${novoEmail().toUpperCase()} ` });
    const id = await criarUsuarioComSenha(banco, hashReal, d);
    const [u] = await usuariosCom(d.email);
    expect(u).toMatchObject({ id, nome: d.nome, email: d.email.trim().toLowerCase(), perfilId: "tecnico", ativo: true, ficticio: true, criadoPor: null });
    const contas = await contasDe(id);
    expect(contas).toHaveLength(1);
    expect(contas[0]).toMatchObject({ providerId: "credential", accountId: id });
    // Formato lido em @better-auth/utils/dist/password.node.mjs:30-34: salt hex de 16 bytes, ":", chave scrypt hex de 64 bytes.
    expect(contas[0].password).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    const [ev] = await eventos(id, "usuario_criado");
    expect(ev).toMatchObject({
      autorId: null,
      entidade: "usuarios",
      antes: null,
      depois: { email: u.email, perfil: "tecnico", ficticio: true, operador: "operador_teste" },
      justificativa: "criação pelo script de operação usuario:criar",
    });
    expect(JSON.stringify(ev)).not.toContain(SENHA);
  });

  it("criadoPor é gravado na coluna e como autor", async () => {
    const criador = await criarUsuarioComSenha(banco, hashReal, dados());
    const id = await criarUsuarioComSenha(banco, async () => "a:b", dados({ criadoPor: criador }));
    expect((await banco.select().from(schema.usuarios).where(eq(schema.usuarios.id, id)))[0].criadoPor).toBe(criador);
    expect((await eventos(id, "usuario_criado"))[0].autorId).toBe(criador);
  });

  it.each([
    [11, false],
    [12, true],
    [128, true],
    [129, false],
  ])("senha de %i caracteres: aceita = %s; recusada não chama o hash nem grava", async (n, aceita) => {
    const hash = vi.fn(async () => "a:b");
    const d = dados({ senha: "s".repeat(n) });
    const r = criarUsuarioComSenha(banco, hash, d);
    if (aceita) await expect(r).resolves.toBeTypeOf("string");
    else {
      await expect(r).rejects.toThrow("Senha fora da política.");
      expect(hash).not.toHaveBeenCalled();
    }
    expect(await usuariosCom(d.email)).toHaveLength(aceita ? 1 : 0);
  });

  it.each([
    ["perfil que nunca existiu", { perfil: "visitante" as Perfil }, "Perfil inexistente."],
    ["e-mail inválido", { email: "nao-e-email" }, "E-mail inválido."],
    ["nome vazio", { nome: "   " }, "Nome inválido."],
  ])("%s é recusado sem gravar", async (_n, o, msg) => {
    const hash = vi.fn(async () => "a:b");
    const d = dados(o);
    const erro = await criarUsuarioComSenha(banco, hash, d).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDominio);
    expect((erro as Error).message).toBe(msg);
    expect(ehMensagemDeDominio(msg)).toBe(true);
    expect(hash).not.toHaveBeenCalled();
    if (d.email.includes("@")) expect(await usuariosCom(d.email)).toHaveLength(0);
  });

  it("segunda barreira: INSERT direto pulando a validação recebe 23503/23505 do Postgres e a frase da classe", async () => {
    const erroDe = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as Error & { cause?: { code?: string } });
    const perfil = await erroDe(banco.insert(schema.usuarios).values({ nome: "[FICTÍCIO] X", email: novoEmail(), perfilId: "visitante", ficticio: true }));
    expect(perfil?.cause?.code).toBe("23503");
    expect(mensagemDeErro(perfil)).toBe(MSG_PERFIL);
    const d = dados();
    await criarUsuarioComSenha(banco, async () => "a:b", d);
    const duplicado = await erroDe(banco.insert(schema.usuarios).values({ nome: "[FICTÍCIO] X", email: d.email, perfilId: "tecnico", ficticio: true }));
    expect(duplicado?.cause?.code).toBe("23505");
    expect(mensagemDeErro(duplicado)).toBe(MSG_DUPLICADO);
  });

  it("e-mail duplicado em outra caixa é recusado, sem usuário nem conta órfã", async () => {
    const d = dados();
    const id = await criarUsuarioComSenha(banco, hashReal, d);
    for (const email of [d.email, ` ${d.email.toUpperCase()}`, d.email.replace(/^t/, "T")]) {
      const erro = await criarUsuarioComSenha(banco, hashReal, dados({ email })).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ErroDominio);
      expect((erro as Error).message).toBe("E-mail já cadastrado.");
    }
    expect(ehMensagemDeDominio("E-mail já cadastrado.")).toBe(true);
    expect((await usuariosCom(d.email)).map((u) => u.id)).toEqual([id]);
    expect(await contasDe(id)).toHaveLength(1);
    expect(await eventos(id, "usuario_criado")).toHaveLength(1);
  });

  it("falha ao gravar a conta desfaz o usuário (transação)", async () => {
    const d = dados();
    // NUL em text: o Postgres recusa o INSERT de contas, depois do INSERT de usuarios.
    await expect(criarUsuarioComSenha(banco, async () => "a\u0000b", d)).rejects.toThrow();
    expect(await usuariosCom(d.email)).toHaveLength(0);
  });

  it("falha ao gravar a auditoria desfaz usuário e conta (transação)", async () => {
    // Stub: o banco real, mas o INSERT em eventos_auditoria lança (dentro ou fora da transação).
    const envolver = <T extends object>(alvo: T): T =>
      new Proxy(alvo, {
        get(o, k) {
          if (k === "insert")
            return (t: unknown) => {
              if (t === schema.eventosAuditoria) throw new Error("falha simulada na auditoria");
              return (o as unknown as typeof banco).insert(t as typeof schema.usuarios);
            };
          if (k === "transaction")
            return (f: (tx: typeof banco) => unknown) => (o as unknown as typeof banco).transaction((tx) => f(envolver(tx) as unknown as typeof banco) as Promise<unknown>);
          const v = Reflect.get(o, k);
          return typeof v === "function" ? v.bind(o) : v;
        },
      });
    const d = dados();
    await expect(criarUsuarioComSenha(envolver(banco), hashReal, d)).rejects.toThrow("falha simulada na auditoria");
    expect(await usuariosCom(d.email)).toHaveLength(0);
    expect(await banco.select().from(schema.contas).where(sql`${schema.contas.userId} in (select id from usuarios where email = ${d.email})`)).toHaveLength(0);
  });

  it("e-mail com espaços e maiúsculas é gravado normalizado em usuarios e na auditoria", async () => {
    const local = `Fulano-${randomUUID()}`;
    const id = await criarUsuarioComSenha(banco, hashReal, dados({ email: `  ${local}@Ficticio.INVALID ` }));
    const esperado = `${local.toLowerCase()}@ficticio.invalid`;
    expect((await banco.select().from(schema.usuarios).where(eq(schema.usuarios.id, id)))[0].email).toBe(esperado);
    expect((await eventos(id, "usuario_criado"))[0].depois).toMatchObject({ email: esperado });
  });

  it("script usuario:criar: ida e volta com o login do Better Auth; saída sem a senha", async () => {
    const email = novoEmail();
    const saida: string[] = [];
    const deps = { banco, hash: hashReal, senha: async () => SENHA, operador: null, log: (m: string) => saida.push(m), erro: (m: string) => saida.push(m) };
    expect(await criarPorScript(["[FICTÍCIO] Script", ` ${email.toUpperCase()} `, "tecnico", "--ficticio"], deps)).toBe(0);
    const r = await entrar(email, SENHA);
    expect(r.response.token).toBeTruthy();
    expect((await usuariosCom(email))[0]).toMatchObject({ ficticio: true, criadoPor: null });
    for (const argv of [[], ["só", "dois"], ["a", "b", "c", "d"]]) expect(await criarPorScript(argv, deps)).toBe(1);
    expect(await criarPorScript(["[FICTÍCIO] X", novoEmail(), "tecnico"], { ...deps, senha: async () => "curta" })).toBe(1);
    expect(await criarPorScript(["[FICTÍCIO] X", novoEmail(), "tecnico"], { ...deps, senha: async () => null })).toBe(1);
    expect(saida.join("\n")).not.toContain(SENHA);
    expect(saida.join("\n")).not.toContain("curta");
  });

  it("redefinir: troca o hash, derruba as sessões, senha antiga falha e a nova entra; auditoria sem senhas", async () => {
    const d = dados();
    const id = await criarUsuarioComSenha(banco, hashReal, d);
    const outro = dados();
    const idOutro = await criarUsuarioComSenha(banco, hashReal, outro);
    const sessaoOutro = cookieDe((await entrar(outro.email, SENHA)).headers);
    const antiga = await entrar(d.email, SENHA);
    const cookie = cookieDe(antiga.headers);
    expect(await novoAuth().api.getSession({ headers: new Headers({ cookie }) })).not.toBeNull();
    exigeAlvoFicticio(` ${d.email.toUpperCase()} `);
    expect(await redefinirSenha(banco, hashReal, { email: ` ${d.email.toUpperCase()} `, novaSenha: NOVA, operador: "operador_teste" })).toBe(true);
    expect(await banco.select().from(schema.sessoes).where(eq(schema.sessoes.userId, id))).toHaveLength(0);
    expect(await novoAuth().api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
    // Só as sessões do alvo: a do outro usuário sobrevive.
    expect(await banco.select().from(schema.sessoes).where(eq(schema.sessoes.userId, idOutro))).toHaveLength(1);
    expect(await novoAuth().api.getSession({ headers: new Headers({ cookie: sessaoOutro }) })).not.toBeNull();
    await expect(entrar(d.email, SENHA)).rejects.toMatchObject({ statusCode: 401 });
    expect((await entrar(d.email, NOVA)).response.token).toBeTruthy();
    const [ev] = await eventos(id, "senha_redefinida");
    expect(ev).toMatchObject({
      autorId: null,
      entidade: "usuarios",
      antes: null,
      depois: { email: d.email, operador: "operador_teste" },
      justificativa: "redefinição pelo script de operação usuario:redefinir-senha",
    });
    expect(JSON.stringify(ev)).not.toContain(SENHA);
    expect(JSON.stringify(ev)).not.toContain(NOVA);
  }, 30_000);

  it("redefinir em transação revertida: só o alvo muda (hash, atualizado_em, sessões); a testemunha fica intacta", async () => {
    const REVERTER = new Error("reverter");
    // Transação externa sempre revertida (padrão de sessao.test.ts): redefinirSenha recebe o tx e a transação dela vira SAVEPOINT.
    const r = await banco
      .transaction(async (tx) => {
        const HASH_ANTIGO = "sal-antigo:chave-antiga";
        const marca = new Date(Date.now() - 60 * 60 * 1000);
        const criarComConta = async () => {
          const email = novoEmail();
          const [u] = await tx.insert(schema.usuarios).values({ nome: "[FICTÍCIO] Escopo", email, perfilId: "tecnico", ficticio: true }).returning({ id: schema.usuarios.id });
          await tx.insert(schema.contas).values({ providerId: "credential", accountId: u.id, userId: u.id, password: HASH_ANTIGO, updatedAt: marca });
          await tx.insert(schema.sessoes).values({ token: randomUUID(), userId: u.id, expiresAt: new Date(Date.now() + 60_000) });
          return { id: u.id, email };
        };
        const alvo = await criarComConta();
        const testemunha = await criarComConta();
        const contaDe = async (id: string) => (await tx.select().from(schema.contas).where(eq(schema.contas.userId, id)))[0];
        const sessoesDe = (id: string) => tx.select().from(schema.sessoes).where(eq(schema.sessoes.userId, id));
        const antesTestemunha = { conta: await contaDe(testemunha.id), sessoes: await sessoesDe(testemunha.id) };
        exigeAlvoFicticio(alvo.email);
        expect(await redefinirSenha(tx, async () => "sal-novo:chave-nova", { email: alvo.email, novaSenha: NOVA, operador: null })).toBe(true);
        const contaAlvo = await contaDe(alvo.id);
        expect(contaAlvo.password).toBe("sal-novo:chave-nova");
        expect(contaAlvo.updatedAt.getTime()).toBeGreaterThan(marca.getTime());
        expect(await sessoesDe(alvo.id)).toHaveLength(0);
        const contaTestemunha = await contaDe(testemunha.id);
        expect(contaTestemunha.password).toBe(HASH_ANTIGO);
        expect(contaTestemunha.updatedAt.getTime()).toBe(antesTestemunha.conta.updatedAt.getTime());
        expect(await sessoesDe(testemunha.id)).toEqual(antesTestemunha.sessoes);
        expect(antesTestemunha.sessoes).toHaveLength(1);
        throw REVERTER;
      })
      .catch((e: unknown) => e);
    if (r !== REVERTER) throw r;
  });

  it("redefinir: senha fora da política recusa sem mudar hash nem sessões", async () => {
    const d = dados();
    const id = await criarUsuarioComSenha(banco, hashReal, d);
    await entrar(d.email, SENHA);
    const [antes] = await contasDe(id);
    const hash = vi.fn(async () => "a:b");
    await expect(redefinirSenha(banco, hash, { email: d.email, novaSenha: "s".repeat(11), operador: null })).rejects.toThrow("Senha fora da política.");
    expect(hash).not.toHaveBeenCalled();
    expect((await contasDe(id))[0].password).toBe(antes.password);
    expect(await banco.select().from(schema.sessoes).where(eq(schema.sessoes.userId, id))).toHaveLength(1);
  });

  it("redefinir: e-mail desconhecido ou inválido devolve false e não grava nada", async () => {
    const conta = async () => (await banco.select({ n: sql<number>`count(*)::int` }).from(schema.eventosAuditoria).where(eq(schema.eventosAuditoria.operacao, "senha_redefinida")))[0].n;
    const n = await conta();
    for (const email of [novoEmail(), "nao-e-email", ""]) expect(await redefinirSenha(banco, async () => "a:b", { email, novaSenha: NOVA, operador: null })).toBe(false);
    expect(await conta()).toBe(n);
  });

  it("redefinir: usuário sem conta credential é recusado com mensagem fixa, sem gravar nem apagar sessões", async () => {
    const email = novoEmail();
    const [u] = await banco.insert(schema.usuarios).values({ nome: "[FICTÍCIO] Sem conta", email, perfilId: "tecnico", ficticio: true }).returning({ id: schema.usuarios.id });
    await banco.insert(schema.sessoes).values({ token: randomUUID(), userId: u.id, expiresAt: new Date(Date.now() + 60_000) });
    const erro = await redefinirSenha(banco, hashReal, { email, novaSenha: NOVA, operador: null }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDominio);
    expect((erro as Error).message).toBe("Usuário sem senha cadastrada.");
    expect(ehMensagemDeDominio("Usuário sem senha cadastrada.")).toBe(true);
    expect(await contasDe(u.id)).toHaveLength(0);
    expect(await banco.select().from(schema.sessoes).where(eq(schema.sessoes.userId, u.id))).toHaveLength(1);
    expect(await eventos(u.id, "senha_redefinida")).toHaveLength(0);
  });

  // Exceção do responsável humano à transação revertida, só aqui: duas conexões reais, dados commitados.
  // Só usuários novos @ficticio.invalid criados pelo teste; nenhum DELETE no teste (o da redefinição tem escopo pelo alvo).
  it("corrida real: login completo com a senha antiga numa segunda conexão entre o UPDATE e o COMMIT tem a sessão recusada", async () => {
    const segunda = drizzle(urlLocal(process.env.DATABASE_URL), { schema });
    try {
      const authLogin = (() => {
        novoAuth(); // estabiliza as variáveis de ambiente
        return criarAuth({ banco: segunda });
      })();
      const d = dados();
      const id = await criarUsuarioComSenha(banco, hashReal, d);
      let login: { token: string; criadaEm: Date; cookie: string } | undefined;
      const aposUpdate = async () => {
        // O UPDATE (atualizado_em = T_r) já rodou e não foi commitado. Espera o relógio passar de T_r, sem sleep:
        // o carimbo do login precisa ser posterior, que é o caso que a primeira gravação não pega.
        const depoisDoUpdate = Date.now();
        while (Date.now() <= depoisDoUpdate);
        // Login completo na segunda conexão: SELECT simples vê o hash commitado (o antigo) e não bloqueia no UPDATE pendente.
        const r = await authLogin.api.signInEmail({ body: { email: d.email, password: SENHA }, headers: new Headers({ "x-real-ip": "203.0.113.20" }), returnHeaders: true });
        const [sessao] = await segunda.select().from(schema.sessoes).where(eq(schema.sessoes.token, r.response.token));
        login = { token: r.response.token, criadaEm: sessao.createdAt, cookie: cookieDe(r.headers) };
      };
      exigeAlvoFicticio(d.email);
      expect(await redefinirSenha(banco, hashReal, { email: d.email, novaSenha: NOVA, operador: null }, { aposUpdate })).toBe(true);
      expect(login).toBeDefined();
      // A sessão foi gravada antes do COMMIT, depois do DELETE da redefinição: sobreviveu e está commitada.
      expect(await banco.select({ t: schema.sessoes.token }).from(schema.sessoes).where(eq(schema.sessoes.userId, id))).toEqual([{ t: login!.token }]);
      // Leitura: recusada pela regra (sessão criada até o atualizado_em da conta), também no /get-session.
      expect(await usuarioDaSessao(banco, id, login!.criadaEm)).toBeNull();
      expect(await novoAuth().api.getSession({ headers: new Headers({ cookie: login!.cookie }) })).toBeNull();
      // Por quê: o carimbo do login é posterior ao T_r da primeira gravação; só a segunda gravação o deixa para trás.
      const [conta] = await contasDe(id);
      expect(conta.updatedAt.getTime()).toBeGreaterThan(login!.criadaEm.getTime());
    } finally {
      await segunda.$client.end();
    }
  });

  it("segunda gravação que falha: o script avisa com mensagem fixa e sai com código diferente de zero", async () => {
    const AVISO = "Senha redefinida, mas a atualização final falhou: sessões abertas durante a troca podem continuar válidas. Rode de novo.";
    // Stub: o banco real, mas o UPDATE fora da transação (a segunda gravação) lança. A transação usa o tx real.
    const falhaNoFim = new Proxy(banco, {
      get(o, k) {
        if (k === "update") return () => {
          throw new Error("falha simulada na segunda gravação");
        };
        const v = Reflect.get(o, k);
        return typeof v === "function" ? v.bind(o) : v;
      },
    });
    const d = dados();
    const id = await criarUsuarioComSenha(banco, hashReal, d);
    const [antes] = await contasDe(id);
    const saida: string[] = [];
    const deps = { banco: falhaNoFim, hash: hashReal, senha: async () => NOVA, operador: null, log: (m: string) => saida.push(`log:${m}`), erro: (m: string) => saida.push(`erro:${m}`) };
    exigeAlvoFicticio(d.email);
    expect(await redefinirPorScript([d.email], deps)).toBe(1);
    expect(saida).toEqual([`erro:${AVISO}`]);
    expect(ehMensagemDeDominio(AVISO)).toBe(true);
    // A troca em si foi commitada (o aviso diz isso): hash novo.
    expect((await contasDe(id))[0].password).not.toBe(antes.password);
    expect(saida.join("\n")).not.toContain("falha simulada");
  });

  it("script usuario:redefinir-senha: mensagens fixas, saída sem a senha", async () => {
    const d = dados();
    await criarUsuarioComSenha(banco, hashReal, d);
    const saida: string[] = [];
    const deps = { banco, hash: hashReal, senha: async () => NOVA, operador: null, log: (m: string) => saida.push(`log:${m}`), erro: (m: string) => saida.push(`erro:${m}`) };
    exigeAlvoFicticio(d.email);
    expect(await redefinirPorScript([d.email], deps)).toBe(0);
    expect(await redefinirPorScript([novoEmail()], deps)).toBe(1);
    expect(await redefinirPorScript([], deps)).toBe(1);
    expect(await redefinirPorScript([d.email], { ...deps, senha: async () => null })).toBe(1);
    expect(saida).toEqual([
      "log:Senha redefinida. Sessões encerradas.",
      "erro:E-mail inválido ou não encontrado.",
      "erro:Uso: pnpm usuario:redefinir-senha <email> (senha pela entrada padrão).",
      "erro:As senhas não conferem.",
    ]);
    expect(saida.join("\n")).not.toContain(NOVA);
  });
});
