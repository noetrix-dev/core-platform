import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ErroDominio } from "../dominio/comum";
import { PERFIS, type Perfil } from "../dominio/permissoes/perfis";
import { emailParaAuditoria, senhaValida } from "../dominio/seguranca/login";
import * as schema from "./db/schema";

type Banco = NodePgDatabase<typeof schema>;
/** O hash do contexto do Better Auth (`(await auth.$context).password.hash`): o mesmo formato que o login verifica. */
type Hash = (senha: string) => Promise<string>;

/** Nome de usuário do sistema operacional, só se tiver forma de login Unix simples; o resto vira null. */
export const operadorValido = (nome: unknown): string | null => (typeof nome === "string" && /^[a-z_][a-z0-9_-]{0,31}$/.test(nome) ? nome : null);

/** Marca de desbloqueio: falhas de login anteriores a ela deixam de contar. E-mail inválido ou desconhecido não grava nada. */
export async function desbloquearUsuario(banco: Banco, email: string): Promise<boolean> {
  const normalizado = emailParaAuditoria(email);
  if (!normalizado) return false;
  const [u] = await banco.select({ id: schema.usuarios.id }).from(schema.usuarios).where(eq(schema.usuarios.email, normalizado));
  if (!u) return false;
  await banco.insert(schema.eventosAuditoria).values({
    autorId: null,
    operacao: "login_desbloqueio",
    entidade: "usuarios",
    entidadeId: u.id,
    antes: null,
    depois: { email: normalizado },
    justificativa: "desbloqueio pelo script de operação",
  });
  return true;
}

/**
 * Usuário, conta `credential` e evento `usuario_criado` numa transação só (falha em qualquer passo não deixa órfão).
 * Linhas gravadas pelo drizzle, no formato que o login do Better Auth lê (sign-in.mjs:287-305). Senha nunca vai à auditoria.
 */
export async function criarUsuarioComSenha(
  banco: Banco,
  hash: Hash,
  d: { nome: string; email: string; senha: string; perfil: Perfil; ficticio: boolean; criadoPor: string | null; operador: string | null },
): Promise<string> {
  if (!senhaValida(d.senha)) throw new ErroDominio("Senha fora da política.");
  const email = emailParaAuditoria(d.email);
  if (!email) throw new ErroDominio("E-mail inválido.");
  const nome = d.nome.trim();
  if (!nome) throw new ErroDominio("Nome inválido.");
  if (!(PERFIS as readonly string[]).includes(d.perfil)) throw new ErroDominio("Perfil inexistente.");
  const senhaHash = await hash(d.senha);
  return banco.transaction(async (tx) => {
    const [perfil] = await tx.select({ id: schema.perfis.id }).from(schema.perfis).where(eq(schema.perfis.id, d.perfil));
    if (!perfil) throw new ErroDominio("Perfil inexistente.");
    // ponytail: pré-checagem fora de trava; numa corrida o unique de usuarios.email recusa e a transação desfaz tudo.
    const [existente] = await tx.select({ id: schema.usuarios.id }).from(schema.usuarios).where(eq(schema.usuarios.email, email));
    if (existente) throw new ErroDominio("E-mail já cadastrado.");
    const [u] = await tx
      .insert(schema.usuarios)
      .values({ nome, email, perfilId: d.perfil, ativo: true, ficticio: d.ficticio, criadoPor: d.criadoPor })
      .returning({ id: schema.usuarios.id });
    await tx.insert(schema.contas).values({ providerId: "credential", accountId: u.id, userId: u.id, password: senhaHash });
    await tx.insert(schema.eventosAuditoria).values({
      autorId: d.criadoPor,
      operacao: "usuario_criado",
      entidade: "usuarios",
      entidadeId: u.id,
      antes: null,
      depois: { email, perfil: d.perfil, ficticio: d.ficticio, operador: operadorValido(d.operador) },
      justificativa: "criação pelo script de operação usuario:criar",
    });
    return u.id;
  });
}

/**
 * Troca o hash da conta `credential` (recusa se faltar) e apaga todas as sessões do usuário, na mesma transação.
 * E-mail inválido ou desconhecido devolve false sem gravar nada. Auditoria `senha_redefinida` sem senha, sem autor.
 */
export async function redefinirSenha(banco: Banco, hash: Hash, d: { email: string; novaSenha: string; operador: string | null }): Promise<boolean> {
  if (!senhaValida(d.novaSenha)) throw new ErroDominio("Senha fora da política.");
  const email = emailParaAuditoria(d.email);
  if (!email) return false;
  const senhaHash = await hash(d.novaSenha);
  return banco.transaction(async (tx) => {
    const [u] = await tx.select({ id: schema.usuarios.id }).from(schema.usuarios).where(eq(schema.usuarios.email, email));
    if (!u) return false;
    const atualizadas = await tx
      .update(schema.contas)
      .set({ password: senhaHash, updatedAt: new Date() })
      .where(and(eq(schema.contas.userId, u.id), eq(schema.contas.providerId, "credential")))
      .returning({ id: schema.contas.id });
    // Sem conta credential: recusa. Lançar desfaz a transação (o UPDATE não tocou nada; as sessões ainda não foram apagadas).
    if (atualizadas.length === 0) throw new ErroDominio("Usuário sem senha cadastrada.");
    await tx.delete(schema.sessoes).where(eq(schema.sessoes.userId, u.id));
    await tx.insert(schema.eventosAuditoria).values({
      autorId: null,
      operacao: "senha_redefinida",
      entidade: "usuarios",
      entidadeId: u.id,
      antes: null,
      depois: { email, operador: operadorValido(d.operador) },
      justificativa: "redefinição pelo script de operação usuario:redefinir-senha",
    });
    return true;
  });
}
