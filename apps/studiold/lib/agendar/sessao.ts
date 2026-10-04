// Cookie da sessão de agendamento de /agendar. Só Server Actions de
// app/agendar/actions.ts chamam isto (cookies() só é gravável em Server
// Action / Route Handler). O segredo vem de AGENDAR_COOKIE_SECRET, editado à
// mão em .env.local e na Vercel — falha alto se faltar, mesmo padrão de
// lib/email/resend.ts.
import "server-only";
import { cookies } from "next/headers";
import { assinarSessao, lerSessaoAssinada, type DadosSessao } from "./sessao-token.ts";

const NOME = "agendar_sessao";
const DURACAO_MIN = 30;

function segredo(): string {
  const s = process.env.AGENDAR_COOKIE_SECRET;
  if (!s || s.length < 32) throw new Error("Falta AGENDAR_COOKIE_SECRET (>= 32 caracteres) no ambiente");
  return s;
}

export async function gravarSessao(d: { clienteId: string; telefone: string }): Promise<void> {
  const exp = Date.now() + DURACAO_MIN * 60_000;
  (await cookies()).set(NOME, assinarSessao({ ...d, exp }, segredo()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/agendar",
    maxAge: DURACAO_MIN * 60,
  });
}

export async function lerSessao(): Promise<DadosSessao | null> {
  const valor = (await cookies()).get(NOME)?.value;
  return valor ? lerSessaoAssinada(valor, segredo(), Date.now()) : null;
}

export async function apagarSessao(): Promise<void> {
  (await cookies()).delete({ name: NOME, path: "/agendar" });
}
