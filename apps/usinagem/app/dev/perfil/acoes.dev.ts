"use server";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { seletorDevAtivo } from "../../../lib/dominio/seguranca/dev";
import { acaoPublica } from "../../../lib/servidor/acao";
import { db } from "../../../lib/servidor/db";
import { usuarios } from "../../../lib/servidor/db/schema";
import { COOKIE_USUARIO_DEV } from "../../../lib/servidor/sessao-dev";

// Pública porque escolhe a própria identidade de dev; o gate e o filtro fictício + ativo são a barreira.
// Fora do gate o arquivo nem entra no build (pageExtensions); a checagem aqui é defesa em profundidade.
export const escolherPerfil = acaoPublica(z.object({ id: z.uuid() }), async ({ id }) => {
  if (!seletorDevAtivo(process.env)) throw new Error("Seletor de dev desligado.");
  const [u] = await db().select({ id: usuarios.id, ficticio: usuarios.ficticio, ativo: usuarios.ativo }).from(usuarios).where(eq(usuarios.id, id));
  // Checado em código (não só no WHERE) para o teste provar a regra sem banco.
  if (!u || u.ficticio !== true || u.ativo !== true) throw new Error("Usuário fictício ativo não encontrado.");
  (await cookies()).set(COOKIE_USUARIO_DEV, u.id, { httpOnly: true, sameSite: "strict", path: "/" });
  redirect("/");
});
