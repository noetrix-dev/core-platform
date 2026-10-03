"use server";

// Server Actions da verificação de identidade de /agendar (Spec A).
//
// INTENCIONAL: nenhuma função aqui chama requireUser(). É a única área do
// app onde isso é propositalmente omitido — /agendar é autoatendimento
// público, sem sessão de equipe. Não "corrigir" isto num review futuro.
// A barreira de confiança é revalidar tudo no servidor (telefone, formato de
// código, janelas de rate limit), nunca confiar no estado que o cliente
// mandou. Ver docs/superpowers/specs/2026-10-03-verificacao-identidade-agendar-design.md

import { tenantDb } from "@/lib/supabase/server";
import { normalizarTelefone } from "@/lib/clientes/telefone";
import { limparEmail } from "@/lib/clientes/email";
import { sendEmail } from "@/lib/email/resend";
import { gerarCodigo } from "@/lib/agendar/codigo";

const RATE_LIMIT_JANELA_MIN = 10;
const RATE_LIMIT_MAX_PEDIDOS = 3;
const CODIGO_EXPIRA_MIN = 10;
const MAX_TENTATIVAS = 5;

// Erro de DB/API nunca vaza texto cru pro cliente anônimo de /agendar (sem
// sessão, sem auth) — só loga server-side e devolve uma mensagem fixa pt-BR.
function erroInterno(tag: string, mensagem: string): { ok: false; error: string } {
  console.error(`[agendar/${tag}]`, mensagem);
  return { ok: false, error: "Não foi possível completar essa etapa. Tente de novo em alguns segundos." };
}

// clientes.telefone e codigos_verificacao.telefone guardam SÓ dígitos, sem
// "+55" (confirmado ao vivo no Supabase, barbearia_001) — diferente do que
// normalizarTelefone() devolve. Usa normalizarTelefone() pra validar o
// formato e tira o prefixo antes de qualquer query/RPC.
function telefoneDigitos(raw: string): string | null {
  const canonico = normalizarTelefone(raw);
  return canonico ? canonico.slice(3) : null;
}

export type IniciarVerificacaoResultado =
  | { ok: true; precisaEmail: true; telefone: string }
  | { ok: true; precisaEmail: false; telefone: string }
  | { ok: false; error: string };

export async function iniciarVerificacao(
  telefoneRaw: string,
  emailRaw?: string,
): Promise<IniciarVerificacaoResultado> {
  const telefone = telefoneDigitos(telefoneRaw);
  if (!telefone) return { ok: false, error: "Telefone inválido. Use DDD + número." };

  const db = tenantDb();

  const desde = new Date(Date.now() - RATE_LIMIT_JANELA_MIN * 60_000).toISOString();
  const pedidos = await db
    .from("codigos_verificacao")
    .select("id", { count: "exact", head: true })
    .eq("telefone", telefone)
    .gte("criado_em", desde);
  if (pedidos.error) {
    return erroInterno("iniciarVerificacao/rateLimit", pedidos.error.message);
  }
  if ((pedidos.count ?? 0) >= RATE_LIMIT_MAX_PEDIDOS) {
    return {
      ok: false,
      error: "Muitos códigos pedidos pra esse telefone. Espere alguns minutos e tente de novo.",
    };
  }

  const cliente = await db
    .from("clientes")
    .select("email")
    .eq("telefone", telefone)
    .eq("ativo", true)
    .maybeSingle();
  if (cliente.error) {
    return erroInterno("iniciarVerificacao/cliente", cliente.error.message);
  }

  let email = (cliente.data as { email: string | null } | null)?.email ?? null;
  if (!email) {
    const informado = limparEmail(emailRaw ?? "");
    if (informado === "invalido") return { ok: false, error: "E-mail inválido." };
    if (!informado) return { ok: true, precisaEmail: true, telefone };
    email = informado;
  }

  const codigo = gerarCodigo();
  const expiraEm = new Date(Date.now() + CODIGO_EXPIRA_MIN * 60_000).toISOString();
  const ins = await db
    .from("codigos_verificacao")
    .insert({
      telefone,
      codigo,
      canal: "email",
      email,
      expira_em: expiraEm,
    })
    .select("id")
    .single();
  if (ins.error) return erroInterno("iniciarVerificacao/insert", ins.error.message);

  const envio = await sendEmail({
    to: email,
    subject: "Seu código de verificação StudiOLD",
    html: `<p>Seu código de verificação é <strong>${codigo}</strong>. Ele expira em ${CODIGO_EXPIRA_MIN} minutos.</p>`,
  });
  if (!envio.ok) {
    // Envio falhou: não deixa a linha contar pro rate-limit de 3/10min.
    await db.from("codigos_verificacao").delete().eq("id", (ins.data as { id: string }).id);
    return erroInterno("iniciarVerificacao/sendEmail", envio.error);
  }

  return { ok: true, precisaEmail: false, telefone };
}

export type VerificarCodigoResultado =
  | { ok: true; novo: false; clienteId: string; nome: string }
  | { ok: true; novo: true }
  | { ok: false; error: string };

export async function verificarCodigo(
  telefoneRaw: string,
  codigoRaw: string,
): Promise<VerificarCodigoResultado> {
  const telefone = telefoneDigitos(telefoneRaw);
  if (!telefone) return { ok: false, error: "Telefone inválido." };
  const codigo = codigoRaw.trim();
  if (!/^\d{6}$/.test(codigo)) return { ok: false, error: "Código inválido. Digite os 6 números." };

  const db = tenantDb();
  const linha = await db
    .from("codigos_verificacao")
    .select("id, codigo, tentativas, expira_em, email")
    .eq("telefone", telefone)
    .eq("usado", false)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (linha.error) return erroInterno("verificarCodigo", linha.error.message);

  const row = linha.data as
    | { id: string; codigo: string; tentativas: number; expira_em: string; email: string | null }
    | null;
  if (!row) return { ok: false, error: "Código expirado ou não encontrado. Peça um novo código." };

  if (new Date(row.expira_em).getTime() < Date.now()) {
    await db.from("codigos_verificacao").update({ usado: true }).eq("id", row.id);
    return { ok: false, error: "Código expirado. Peça um novo código." };
  }

  if (row.codigo !== codigo) {
    const tentativas = row.tentativas + 1;
    await db
      .from("codigos_verificacao")
      .update({ tentativas, usado: tentativas >= MAX_TENTATIVAS })
      .eq("id", row.id);
    return tentativas >= MAX_TENTATIVAS
      ? { ok: false, error: "Código incorreto muitas vezes. Peça um novo código." }
      : { ok: false, error: "Código incorreto. Tente de novo." };
  }

  await db.from("codigos_verificacao").update({ usado: true }).eq("id", row.id);

  const cliente = await db
    .from("clientes")
    .select("id, nome, email")
    .eq("telefone", telefone)
    .eq("ativo", true)
    .maybeSingle();
  if (cliente.error) return erroInterno("verificarCodigo/cliente", cliente.error.message);

  const c = cliente.data as { id: string; nome: string; email: string | null } | null;
  if (c) {
    // Cliente existente sem e-mail cadastrado forneceu um agora pra receber
    // o código — persiste, senão fica pedindo de novo a cada verificação.
    // Nunca sobrescreve um e-mail já cadastrado.
    if (!c.email && row.email) {
      await db.from("clientes").update({ email: row.email }).eq("id", c.id);
    }
    return { ok: true, novo: false, clienteId: c.id, nome: c.nome };
  }
  return { ok: true, novo: true };
}

export type ConfirmarCadastroResultado =
  | { ok: true; clienteId: string; nome: string }
  | { ok: false; error: string };

export async function confirmarCadastro(
  telefoneRaw: string,
  nomeRaw: string,
  emailRaw: string,
): Promise<ConfirmarCadastroResultado> {
  const telefone = telefoneDigitos(telefoneRaw);
  if (!telefone) return { ok: false, error: "Telefone inválido." };
  const nome = nomeRaw.trim().slice(0, 120);
  if (!nome) return { ok: false, error: "Informe seu nome." };
  const email = limparEmail(emailRaw);
  if (!email || email === "invalido") return { ok: false, error: "E-mail inválido." };

  const rpc = await tenantDb().rpc("fn_cadastrar_cliente_whatsapp_v2", {
    p_numero: telefone,
    p_nome: nome,
    p_email: email,
  });
  if (rpc.error) return erroInterno("confirmarCadastro", rpc.error.message);

  const r = rpc.data as {
    sucesso: boolean;
    codigo: string;
    cliente_id?: string;
    nome?: string;
  };

  if (r.sucesso && r.codigo === "CLIENTE_CRIADO") {
    if (!r.cliente_id) {
      return erroInterno("confirmarCadastro/semClienteId", "RPC retornou CLIENTE_CRIADO sem cliente_id");
    }
    return { ok: true, clienteId: r.cliente_id, nome: r.nome ?? nome };
  }
  if (!r.sucesso && r.codigo === "CLIENTE_INATIVO") {
    return {
      ok: false,
      error: "Esse telefone já tem um cadastro inativo. Fale direto com a barbearia pra reativar.",
    };
  }
  // CLIENTE_EXISTENTE_VINCULADO não deveria acontecer neste ramo (só é
  // chamado quando verificarCodigo já disse "novo") — defensivo, RPC é
  // compartilhada com o bot do WhatsApp.
  return { ok: false, error: "Não foi possível concluir o cadastro. Tente de novo." };
}
