// Token da sessão de agendamento de /agendar: prova, do lado do servidor,
// que o telefone passou pela verificação por código (Spec A). Formato:
// base64url(JSON) + "." + base64url(HMAC-SHA256(corpo)). Puro e testável —
// quem lê/grava cookie é lib/agendar/sessao.ts.
import { createHmac, timingSafeEqual } from "node:crypto";

export type DadosSessao = { clienteId: string; telefone: string; exp: number };

function assinatura(corpo: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(corpo).digest();
}

export function assinarSessao(dados: DadosSessao, secret: string): string {
  const corpo = Buffer.from(JSON.stringify(dados)).toString("base64url");
  return `${corpo}.${assinatura(corpo, secret).toString("base64url")}`;
}

export function lerSessaoAssinada(valor: string, secret: string, agora: number): DadosSessao | null {
  const partes = valor.split(".");
  if (partes.length !== 2 || !partes[0] || !partes[1]) return null;
  const [corpo, sig] = partes;
  const esperado = assinatura(corpo, secret);
  const recebido = Buffer.from(sig, "base64url");
  if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) return null;

  let d: unknown;
  try {
    d = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!d || typeof d !== "object") return null;
  const { clienteId, telefone, exp } = d as Record<string, unknown>;
  if (typeof clienteId !== "string" || typeof telefone !== "string" || typeof exp !== "number") return null;
  if (exp <= agora) return null;
  return { clienteId, telefone, exp };
}
