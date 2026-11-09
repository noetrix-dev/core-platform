"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { acaoPublica } from "../../lib/servidor/acao";
import { auth } from "../../lib/servidor/auth";

// Pública: sair precisa funcionar com sessão obsoleta ou já apagada. O signOut do Better Auth expira o cookie
// sempre, exista a linha da sessão ou não (sign-out.mjs:20-26), e o nextCookies() grava o Set-Cookie na resposta.
export const sair = acaoPublica(z.object({}), async () => {
  await auth().api.signOut({ headers: await headers() });
  redirect("/entrar");
});
