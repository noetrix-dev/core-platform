import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { NOME_PERFIL, type Perfil } from "../../../lib/dominio/permissoes/perfis";
import { seletorDevAtivo } from "../../../lib/dominio/seguranca/dev";
import { db } from "../../../lib/servidor/db";
import { usuarios } from "../../../lib/servidor/db/schema";
import { BotaoPerfil } from "./BotaoPerfil.dev";

export const dynamic = "force-dynamic";

// Só vira rota com o gate ligado (pageExtensions em next.config.ts). O notFound é defesa em profundidade.
export default async function SeletorPerfil() {
  if (!seletorDevAtivo(process.env)) notFound();
  const lista = await db()
    .select({ id: usuarios.id, nome: usuarios.nome, perfil: usuarios.perfilId })
    .from(usuarios)
    .where(and(eq(usuarios.ficticio, true), eq(usuarios.ativo, true)));
  return (
    <main>
      <h1>Seletor de perfil (somente desenvolvimento, dados fictícios)</h1>
      <ul>
        {lista.map((u) => (
          <li key={u.id}>
            <BotaoPerfil id={u.id} rotulo={`${u.nome} (${NOME_PERFIL[u.perfil as Perfil]})`} />
          </li>
        ))}
      </ul>
    </main>
  );
}
