// Wrapper fino sobre o SDK do Resend. Só as Server Actions de /agendar
// chamam isto. Lê RESEND_API_KEY do ambiente (editado à mão, nunca por
// código) — falha alto e claro se a chave não existir, mesmo padrão de
// lib/supabase/server.ts.
//
// Domínio de teste (onboarding@resend.dev): só entrega pro e-mail cadastrado
// na própria conta Resend enquanto nenhum domínio próprio for verificado.
// Troca de domínio depois é só variável de ambiente.

import { Resend } from "resend";

let cached: Resend | null = null;

function client(): Resend {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Falta RESEND_API_KEY no ambiente");
  cached = new Resend(key);
  return cached;
}

export async function sendEmail(p: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client().emails.send({
    from: "StudiOLD <onboarding@resend.dev>",
    to: [p.to],
    subject: p.subject,
    html: p.html,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
