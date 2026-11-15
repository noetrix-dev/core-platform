import { and, eq, or, sql } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { ErroDominio } from "../dominio/comum";
import { PERFIS, type Perfil } from "../dominio/permissoes/perfis";
import { validarAlteracaoUsuario } from "../dominio/usuarios/admin";
import * as schema from "./db/schema";
import type { SessaoAutorizada } from "./sessao";

/** Pool (produção) ou transação (teste: `transaction` aninhada vira SAVEPOINT). */
type Executor = PgDatabase<NodePgQueryResultHKT, typeof schema>;
export type LinhaTravada = { id: string; perfil: Perfil; ativo: boolean; ficticio: boolean };

const RECUSADA = "Alteração de usuário recusada.";
// versao é integer (int4): acima disso o Postgres lançaria 22003 em vez da recusa de domínio.
const INT4_MAX = 2147483647;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Muda perfil e/ou ativo de um usuário sem nunca deixar zero Admin ativo, numa transação só:
 * trava (FOR UPDATE, ordem por id) os Admins ativos e o alvo, valida, atualiza filtrando pela versão lida,
 * apaga as sessões do alvo se ele foi desativado ou trocou de perfil, e grava `usuario_alterado`.
 * Nesses dois casos grava `contas.atualizado_em` (relógio do app) na transação e de novo depois do COMMIT, como redefinirSenha:
 * um login que passou pela checagem de ativo antes do COMMIT e grava a sessão depois fica recusado mesmo após reativação.
 * Se a gravação depois do COMMIT falhar, lança ErroDominio com aviso fixo (a alteração já foi commitada).
 * Recusa sempre com mensagem genérica (o motivo não vai ao cliente).
 *
 * Autorização é do chamador: use `requirePermissaoSensivel("usuarios.gerenciar")` (via `acaoSensivel`) antes.
 * Passe o pool, não uma transação externa: dentro de uma, a trava dura até o COMMIT de fora e a segunda gravação vira parte
 * da transação externa, sem acontecer depois do COMMIT real (a correção da corrida com o login some sem aviso). Só os testes fazem isso.
 */
export async function alterarUsuario(
  banco: Executor,
  autor: SessaoAutorizada,
  alvoId: string,
  versaoLida: number,
  mudanca: { perfil?: Perfil; ativo?: boolean },
  // Só para teste: roda logo depois do SELECT ... FOR UPDATE, com as linhas travadas (corrida entre duas conexões).
  // antesDoCommit: roda no fim da transação, com tudo gravado e nada commitado (corrida com login concorrente).
  ganchos: { aposTrava?: (linhas: LinhaTravada[], tx: Executor) => Promise<void>; antesDoCommit?: (tx: Executor) => Promise<void> } = {},
): Promise<void> {
  if (!UUID.test(alvoId) || !(Number.isSafeInteger(versaoLida) && versaoLida <= INT4_MAX) || (mudanca.perfil !== undefined && !PERFIS.includes(mudanca.perfil)))
    throw new ErroDominio("Alteração de usuário recusada.");
  const u = schema.usuarios;
  const credencial = and(eq(schema.contas.userId, alvoId), eq(schema.contas.providerId, "credential"));
  const derrubou = await banco.transaction(async (tx) => {
    const linhas: LinhaTravada[] = (
      await tx
        .select({ id: u.id, perfil: u.perfilId, ativo: u.ativo, ficticio: u.ficticio })
        .from(u)
        .where(or(and(eq(u.perfilId, "admin"), eq(u.ativo, true)), eq(u.id, alvoId)))
        .orderBy(u.id)
        .for("update")
    ).map((l) => ({ ...l, perfil: l.perfil as Perfil }));
    await ganchos.aposTrava?.(linhas, tx);
    if (!validarAlteracaoUsuario(linhas, alvoId, mudanca).ok) throw new ErroDominio(RECUSADA);
    const alvo = linhas.find((l) => l.id === alvoId)!;
    const depois = { perfil: mudanca.perfil ?? alvo.perfil, ativo: mudanca.ativo ?? alvo.ativo };
    const atualizadas = await tx
      .update(u)
      // atualizado_em no relógio do app, como em usuarios-auth.ts.
      .set({ perfilId: depois.perfil, ativo: depois.ativo, versao: sql`${u.versao} + 1`, atualizadoEm: new Date() })
      .where(and(eq(u.id, alvoId), eq(u.versao, versaoLida)))
      .returning({ id: u.id });
    if (atualizadas.length === 0) throw new ErroDominio("Registro alterado por outra pessoa.");
    const derruba = !depois.ativo || depois.perfil !== alvo.perfil;
    if (derruba) {
      await tx.delete(schema.sessoes).where(eq(schema.sessoes.userId, alvoId));
      // Sessão criada até este instante passa a ser recusada (usuarioDaSessao), mesmo se o alvo for reativado.
      await tx.update(schema.contas).set({ updatedAt: new Date() }).where(credencial);
    }
    await tx.insert(schema.eventosAuditoria).values({
      autorId: autor.id,
      operacao: "usuario_alterado",
      entidade: "usuarios",
      entidadeId: alvoId,
      antes: { perfil: alvo.perfil, ativo: alvo.ativo },
      depois,
    });
    await ganchos.antesDoCommit?.(tx);
    return derruba;
  });
  if (!derrubou) return;
  // Segunda gravação, depois do COMMIT: um login carimbado depois da gravação acima, que leu ativo = true antes do COMMIT,
  // grava a sessão depois dele com createdAt posterior à primeira. Este instante fica depois dela.
  try {
    await banco.update(schema.contas).set({ updatedAt: new Date() }).where(credencial);
  } catch {
    throw new ErroDominio("Usuário alterado, mas a atualização final falhou: sessões abertas durante a alteração podem continuar válidas.");
  }
}
