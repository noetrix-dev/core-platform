// Wrapper fino sobre o SDK do Resend. Só as Server Actions de /agendar
// chamam isto. Lê RESEND_API_KEY do ambiente (editado à mão, nunca por
// código) — falha alto e claro se a chave não existir, mesmo padrão de
// lib/supabase/server.ts.
//
// Remetente no domínio próprio mail.noetrix.com.br — precisa estar verificado
// no Resend (DNS), senão a API recusa o envio.

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
  try {
    const { error } = await client().emails.send({
      from: "StudiOLD <noreply@mail.noetrix.com.br>",
      to: [p.to],
      subject: p.subject,
      html: p.html,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
