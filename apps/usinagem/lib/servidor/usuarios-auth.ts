import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { emailParaAuditoria } from "../dominio/seguranca/login";
import * as schema from "./db/schema";

type Banco = NodePgDatabase<typeof schema>;

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
