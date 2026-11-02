import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./db/schema";
import { bancoDisponivel } from "./db/teste-banco";
import { urlLocal } from "./db/url-local";
import { criarUsuarioComSenha, desbloquearUsuario, operadorValido, redefinirSenha } from "./usuarios-auth";
import { criarAuth } from "./auth-config";
import type { Perfil } from "../dominio/permissoes/perfis";
import { main } from "../../scripts/desbloquear-usuario";
import { main as criarPorScript } from "../../scripts/criar-usuario";
import { main as redefinirPorScript } from "../../scripts/redefinir-senha";

const temBanco = bancoDisponivel();

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
    ["perfil fora de PERFIS", { perfil: "visitante" as Perfil }, "Perfil inválido."],
    ["e-mail inválido", { email: "nao-e-email" }, "E-mail inválido."],
    ["nome vazio", { nome: "   " }, "Nome inválido."],
  ])("%s é recusado sem gravar", async (_n, o, msg) => {
    const hash = vi.fn(async () => "a:b");
    const d = dados(o);
    await expect(criarUsuarioComSenha(banco, hash, d)).rejects.toThrow(msg);
    expect(hash).not.toHaveBeenCalled();
    if (d.email.includes("@")) expect(await usuariosCom(d.email)).toHaveLength(0);
  });

  it("e-mail duplicado em outra caixa é recusado, sem usuário nem conta órfã", async () => {
    const d = dados();
    const id = await criarUsuarioComSenha(banco, hashReal, d);
    await expect(criarUsuarioComSenha(banco, hashReal, dados({ email: ` ${d.email.toUpperCase()}` }))).rejects.toThrow("E-mail já cadastrado.");
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
    const antiga = await entrar(d.email, SENHA);
    const cookie = cookieDe(antiga.headers);
    expect(await novoAuth().api.getSession({ headers: new Headers({ cookie }) })).not.toBeNull();
    expect(await redefinirSenha(banco, hashReal, { email: ` ${d.email.toUpperCase()} `, novaSenha: NOVA, operador: "operador_teste" })).toBe(true);
    expect(await banco.select().from(schema.sessoes).where(eq(schema.sessoes.userId, id))).toHaveLength(0);
    expect(await novoAuth().api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
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

  it("redefinir: usuário sem conta credential ganha uma e entra com a nova senha", async () => {
    const email = novoEmail();
    const [u] = await banco.insert(schema.usuarios).values({ nome: "[FICTÍCIO] Sem conta", email, perfilId: "tecnico", ficticio: true }).returning({ id: schema.usuarios.id });
    expect(await redefinirSenha(banco, hashReal, { email, novaSenha: NOVA, operador: null })).toBe(true);
    expect(await contasDe(u.id)).toHaveLength(1);
    expect((await entrar(email, NOVA)).response.token).toBeTruthy();
  });

  it("script usuario:redefinir-senha: mensagens fixas, saída sem a senha", async () => {
    const d = dados();
    await criarUsuarioComSenha(banco, hashReal, d);
    const saida: string[] = [];
    const deps = { banco, hash: hashReal, senha: async () => NOVA, operador: null, log: (m: string) => saida.push(`log:${m}`), erro: (m: string) => saida.push(`erro:${m}`) };
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
