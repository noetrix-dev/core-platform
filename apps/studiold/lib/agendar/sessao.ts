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
// Prova de "código verificado, cliente novo" entre verificarCodigo e
// confirmarCadastro. Chave com separação de domínio: um token de um cookie
// nunca valida como o outro.
const NOME_VERIFICADO = "agendar_verificado";
const VERIFICADO_MIN = 10;

export function segredoConfigurado(): boolean {
  const s = process.env.AGENDAR_COOKIE_SECRET;
  return !!s && s.length >= 32;
}

function segredo(): string {
  if (!segredoConfigurado()) throw new Error("Falta AGENDAR_COOKIE_SECRET (>= 32 caracteres) no ambiente");
  return process.env.AGENDAR_COOKIE_SECRET as string;
}

function segredoVerificado(): string {
  return segredo() + ":verificado";
}

function opcoesCookie(min: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/agendar",
    maxAge: min * 60,
  };
}

export async function gravarSessao(d: { clienteId: string; telefone: string }): Promise<void> {
  const exp = Date.now() + DURACAO_MIN * 60_000;
  (await cookies()).set(NOME, assinarSessao({ ...d, exp }, segredo()), opcoesCookie(DURACAO_MIN));
}

export async function gravarVerificacao(telefone: string): Promise<void> {
  const exp = Date.now() + VERIFICADO_MIN * 60_000;
  (await cookies()).set(
    NOME_VERIFICADO,
    assinarSessao({ clienteId: "", telefone, exp }, segredoVerificado()),
    opcoesCookie(VERIFICADO_MIN),
  );
}

export async function lerVerificacao(): Promise<string | null> {
  const valor = (await cookies()).get(NOME_VERIFICADO)?.value;
  return valor ? (lerSessaoAssinada(valor, segredoVerificado(), Date.now())?.telefone ?? null) : null;
}

export async function apagarVerificacao(): Promise<void> {
  (await cookies()).delete({ name: NOME_VERIFICADO, path: "/agendar" });
}

export async function lerSessao(): Promise<DadosSessao | null> {
  const valor = (await cookies()).get(NOME)?.value;
  return valor ? lerSessaoAssinada(valor, segredo(), Date.now()) : null;
}

export async function apagarSessao(): Promise<void> {
  (await cookies()).delete({ name: NOME, path: "/agendar" });
}
