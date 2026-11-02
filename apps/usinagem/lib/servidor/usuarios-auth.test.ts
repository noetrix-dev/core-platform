import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./db/schema";
import { bancoDisponivel } from "./db/teste-banco";
import { urlLocal } from "./db/url-local";
import { desbloquearUsuario } from "./usuarios-auth";
import { main } from "../../scripts/desbloquear-usuario";

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
