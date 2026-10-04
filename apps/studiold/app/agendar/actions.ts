"use server";

// Server Actions da verificação de identidade de /agendar (Spec A).
//
// INTENCIONAL: nenhuma função aqui chama requireUser(). É a única área do
// app onde isso é propositalmente omitido — /agendar é autoatendimento
// público, sem sessão de equipe. Não "corrigir" isto num review futuro.
// A barreira de confiança é revalidar tudo no servidor (telefone, formato de
// código, janelas de rate limit), nunca confiar no estado que o cliente
// mandou. Ver docs/superpowers/specs/2026-10-03-verificacao-identidade-agendar-design.md
//
// O cookie de sessão (agendar_sessao) só é emitido depois de prova no
// servidor: cliente existente → verificarCodigo grava direto; cliente novo →
// verificarCodigo grava agendar_verificado (cookie assinado, 10 min) e só
// confirmarCadastro, lendo essa prova, cria o cliente e grava a sessão.

import { tenantDb } from "@/lib/supabase/server";
import { normalizarTelefone } from "@/lib/clientes/telefone";
import { limparEmail } from "@/lib/clientes/email";
import { sendEmail } from "@/lib/email/resend";
import { gerarCodigo } from "@/lib/agendar/codigo";
import {
  gravarSessao,
  apagarSessao,
  lerSessao,
  gravarVerificacao,
  lerVerificacao,
  apagarVerificacao,
  segredoConfigurado,
} from "@/lib/agendar/sessao";
import { mascararEmail, partesSaoPaulo, rotuloDia, escaparHtml, minutoPermitido, ehUuid, ehRemarcavel } from "@/lib/agendar/formato";
import { lerAgendamentoDoCliente, type AgendamentoDoCliente } from "@/lib/agendar/meus";
import { fmtPreco } from "@/lib/agenda/time";

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
  if (!segredoConfigurado()) return erroInterno("config", "AGENDAR_COOKIE_SECRET ausente ou curto");
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
  if (!segredoConfigurado()) return erroInterno("config", "AGENDAR_COOKIE_SECRET ausente ou curto");
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
    await gravarSessao({ clienteId: c.id, telefone });
    return { ok: true, novo: false, clienteId: c.id, nome: c.nome };
  }
  await gravarVerificacao(telefone);
  return { ok: true, novo: true };
}

export type ConfirmarCadastroResultado =
  | { ok: true; clienteId: string; nome: string }
  | { ok: false; error: string };

// _telefoneRaw é ignorado de propósito (mantido pela assinatura): o telefone
// vem SÓ da prova assinada gravada por verificarCodigo.
export async function confirmarCadastro(
  _telefoneRaw: string,
  nomeRaw: string,
  emailRaw: string,
): Promise<ConfirmarCadastroResultado> {
  const telefone = await lerVerificacao();
  if (!telefone) return { ok: false, error: "Confirme o código de novo para continuar." };
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
    await apagarVerificacao();
    await gravarSessao({ clienteId: r.cliente_id, telefone });
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

// "É você? Não" — descarta a prova de verificação antes de voltar ao telefone.
export async function encerrarSessao(): Promise<void> {
  await apagarSessao();
}

// ===========================================================================
// Spec B — Passos 2-5. Identidade vem SÓ de lerSessao() (cookie httpOnly
// assinado gravado acima). Telefone/clienteId vindos da UI nunca são aceitos.
// Ver docs/superpowers/specs/2026-10-04-agendamento-agendar-design.md
// ===========================================================================

export type ServicoCatalogo = { id: string; nome: string; preco: number; duracaoMin: number };
export type OpcaoCatalogo = { id: string; nome: string };
export type Catalogo = {
  servicos: ServicoCatalogo[];
  cortesias: OpcaoCatalogo[];
  estilos: OpcaoCatalogo[];
  cortesiaFavoritaId: string | null;
  estiloFavoritoId: string | null;
};
export type Horario = { data: string; hora: string; inicio: string };
export type FalhaAgendar = {
  ok: false;
  error: string;
  sessaoExpirada?: true;
  motivo?: "horario" | "cortesia" | "estilo" | "remarcar";
};
export type ResumoAgendamento = {
  servicos: string[];
  data: string;
  hora: string;
  duracaoMin: number;
  valorTotal: number;
  emailMascarado: string | null;
  remarcado: boolean;
  antigoNaoCancelado: boolean; // novo criado, mas o antigo não foi liberado
};

const SEM_SESSAO: FalhaAgendar = {
  ok: false,
  sessaoExpirada: true,
  error: "Sua sessão expirou, confirme o telefone de novo.",
};
// Mesma resposta para id de outro cliente, inexistente ou malformado — não
// revela quais ids existem.
const NAO_ENCONTRADO: FalhaAgendar = { ok: false, error: "Agendamento não encontrado." };
// ponytail: teto contado fora da advisory lock da RPC — replays concorrentes podem passar 1-2 do limite; trava real exigiria contar dentro de fn_criar_agendamento_v2 (migration).
const MAX_AGENDAMENTOS_SITE_FUTUROS = 2;

function servicoIdsValidos(ids: unknown): ids is string[] {
  return (
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <= 10 &&
    ids.every((x) => ehUuid(x)) &&
    new Set(ids).size === ids.length
  );
}

function idOpcionalValido(id: unknown): id is string | null {
  return id === null || ehUuid(id);
}

export async function carregarCatalogo(): Promise<{ ok: true; catalogo: Catalogo } | FalhaAgendar> {
  const sessao = await lerSessao();
  if (!sessao) return SEM_SESSAO;
  const db = tenantDb();

  const [cat, cortesias, estilos, cliente] = await Promise.all([
    db.rpc("fn_catalogo_servicos_v2"),
    db.from("cortesias").select("id, nome").eq("ativo", true).gt("quantidade_estoque", 0).order("nome"),
    db.from("estilos_musica").select("id, nome").eq("ativo", true).order("nome"),
    db
      .from("clientes")
      .select("cortesia_favorita_id, estilo_musica_id")
      .eq("id", sessao.clienteId)
      .eq("ativo", true)
      .maybeSingle(),
  ]);
  if (cat.error) return erroInterno("carregarCatalogo/rpc", cat.error.message);
  if (cortesias.error) return erroInterno("carregarCatalogo/cortesias", cortesias.error.message);
  if (estilos.error) return erroInterno("carregarCatalogo/estilos", estilos.error.message);
  if (cliente.error) return erroInterno("carregarCatalogo/cliente", cliente.error.message);
  if (!cliente.data) return SEM_SESSAO; // cliente desativado depois da verificação

  const r = cat.data as {
    servicos: { id: string; nome: string; preco: number | string; duracao_minutos: number }[];
  };
  const fav = cliente.data as { cortesia_favorita_id: string | null; estilo_musica_id: string | null };
  const listaCortesias = (cortesias.data ?? []) as OpcaoCatalogo[];
  const listaEstilos = (estilos.data ?? []) as OpcaoCatalogo[];

  return {
    ok: true,
    catalogo: {
      servicos: r.servicos.map((s) => ({
        id: s.id,
        nome: s.nome,
        preco: Number(s.preco),
        duracaoMin: s.duracao_minutos,
      })),
      cortesias: listaCortesias,
      estilos: listaEstilos,
      // favorito só vale se ainda está na lista (ativo / com estoque)
      cortesiaFavoritaId: listaCortesias.some((c) => c.id === fav.cortesia_favorita_id)
        ? fav.cortesia_favorita_id
        : null,
      estiloFavoritoId: listaEstilos.some((e) => e.id === fav.estilo_musica_id) ? fav.estilo_musica_id : null,
    },
  };
}

export async function buscarHorarios(
  servicoIds: string[],
  dataInicio?: string,
): Promise<{ ok: true; horarios: Horario[] } | FalhaAgendar> {
  const sessao = await lerSessao();
  if (!sessao) return SEM_SESSAO;
  if (!servicoIdsValidos(servicoIds)) return { ok: false, error: "Escolha ao menos um serviço." };
  if (dataInicio !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(dataInicio)) {
    return { ok: false, error: "Data inválida." };
  }

  const rpc = await tenantDb().rpc("fn_buscar_disponibilidade", {
    p_servicos: servicoIds,
    p_data_inicio: dataInicio ?? null,
    p_qtd_dias: 7,
  });
  if (rpc.error) return erroInterno("buscarHorarios", rpc.error.message);

  const linhas = (rpc.data ?? []) as { data: string; data_hora: string; hora: string }[];
  return {
    ok: true,
    horarios: linhas
      .filter((l) => minutoPermitido(l.hora))
      .map((l) => ({ data: l.data, hora: l.hora.slice(0, 5), inicio: l.data_hora })),
  };
}

export async function confirmarAgendamento(p: {
  servicoIds: string[];
  inicio: string;
  cortesiaId: string | null;
  estiloId: string | null;
  remarcarId?: string | null;
}): Promise<{ ok: true; resumo: ResumoAgendamento } | FalhaAgendar> {
  const sessao = await lerSessao();
  if (!sessao) return SEM_SESSAO;
  if (!servicoIdsValidos(p.servicoIds)) return { ok: false, error: "Escolha ao menos um serviço." };
  if (
    typeof p.inicio !== "string" ||
    Number.isNaN(Date.parse(p.inicio)) ||
    !minutoPermitido(partesSaoPaulo(p.inicio).hora)
  ) {
    return { ok: false, motivo: "horario", error: "Escolha um horário." };
  }
  if (!idOpcionalValido(p.cortesiaId) || !idOpcionalValido(p.estiloId)) {
    return { ok: false, error: "Opção inválida." };
  }

  const db = tenantDb();

  // Remarcar: confere dono e status ANTES de criar qualquer coisa
  // (fn_cancelar_agendamento_v2 não confere o dono).
  let remarcar: AgendamentoDoCliente | null = null;
  if (p.remarcarId) {
    remarcar = await lerAgendamentoDoCliente(sessao.clienteId, p.remarcarId);
    if (!remarcar || !ehRemarcavel(remarcar, Date.now())) {
      return {
        ok: false,
        motivo: "remarcar",
        error: "Esse agendamento não pode mais ser remarcado. Confirme de novo pra criar um novo horário.",
      };
    }
  }

  let consultaTeto = db
    .from("agendamentos")
    .select("id, slots!inner(data_hora)", { count: "exact", head: true })
    .eq("cliente_id", sessao.clienteId)
    .eq("origem", "site")
    .in("status", ["agendado", "confirmado"])
    .gt("slots.data_hora", new Date().toISOString());
  if (remarcar) consultaTeto = consultaTeto.neq("id", remarcar.id);
  const futuros = await consultaTeto;
  if (futuros.error) return erroInterno("confirmarAgendamento/limite", futuros.error.message);
  if ((futuros.count ?? 0) >= MAX_AGENDAMENTOS_SITE_FUTUROS) {
    return { ok: false, error: "Você já tem horários marcados pelo site. Pra marcar mais, fale direto com a barbearia." };
  }

  // Mesmas checagens de fn_confirmar_booking_whatsapp_v2, antes da RPC, pra
  // dar mensagem específica em vez da exceção genérica.
  if (p.cortesiaId) {
    const c = await db
      .from("cortesias")
      .select("id")
      .eq("id", p.cortesiaId)
      .eq("ativo", true)
      .gt("quantidade_estoque", 0)
      .maybeSingle();
    if (c.error) return erroInterno("confirmarAgendamento/cortesia", c.error.message);
    if (!c.data) {
      return { ok: false, motivo: "cortesia", error: "Essa cortesia acabou de esgotar. Escolha outra ou nenhuma." };
    }
  }
  if (p.estiloId) {
    const e = await db.from("estilos_musica").select("id").eq("id", p.estiloId).eq("ativo", true).maybeSingle();
    if (e.error) return erroInterno("confirmarAgendamento/estilo", e.error.message);
    if (!e.data) {
      return { ok: false, motivo: "estilo", error: "Esse estilo de música não está mais disponível." };
    }
  }

  const rpc = await db.rpc("fn_criar_agendamento_v2", {
    p_cliente_id: sessao.clienteId,
    p_servicos: p.servicoIds,
    p_inicio: p.inicio,
    p_cortesia_id: p.cortesiaId,
    p_estilo_musica_id: p.estiloId,
    p_origem: "site",
  });
  if (rpc.error) {
    const msg = rpc.error.message;
    console.error("[agendar/confirmarAgendamento]", msg);
    if (msg.includes("Horário indisponível")) {
      return { ok: false, motivo: "horario", error: "Esse horário acabou de ser ocupado, escolha outro." };
    }
    if (msg.includes("Cortesia")) {
      return { ok: false, motivo: "cortesia", error: "Essa cortesia acabou de esgotar. Escolha outra ou nenhuma." };
    }
    if (msg.includes("Estilo musical")) {
      return { ok: false, motivo: "estilo", error: "Esse estilo de música não está mais disponível." };
    }
    if (msg.includes("Cliente inexistente")) return SEM_SESSAO;
    return { ok: false, error: "Não foi possível completar essa etapa. Tente de novo em alguns segundos." };
  }

  const r = rpc.data as { inicio: string; duracao_total: number; valor_total: number | string };
  // Agendamento criado: a partir daqui nada desfaz ele. A sessão continua
  // valendo até exp (Spec C: "Ver meus agendamentos" e remarcar sem novo
  // código); o teto MAX_AGENDAMENTOS_SITE_FUTUROS limita replay.

  // Remarcar: só agora, com o novo garantido, libera o antigo. Se falhar, o
  // novo vale e o cliente é avisado para cancelar o antigo em Meus agendamentos.
  let antigoNaoCancelado = false;
  // ponytail: duas abas remarcando o mesmo agendamento criam dois novos (checagem e teto fora da advisory lock); duplo clique na mesma aba é barrado pelo botão desabilitado. Trava real: contar/cancelar dentro de fn_criar_agendamento_v2 (migration).
  if (remarcar) {
    const canc = await db.rpc("fn_cancelar_agendamento_v2", {
      p_agendamento_id: remarcar.id,
      p_motivo: "remarcado",
      p_descricao: null,
      p_origem: "site",
    });
    if (canc.error) {
      console.error("[agendar/confirmarAgendamento/remarcar]", canc.error.message);
      // "não pode ser cancelado" = já liberado por outro pedido/equipe: não há o que o cliente cancelar.
      antigoNaoCancelado = !canc.error.message.includes("não pode ser cancelado");
    }
  }

  const [servicos, cliente] = await Promise.all([
    db.from("servicos").select("id, nome").in("id", p.servicoIds),
    db.from("clientes").select("nome, email").eq("id", sessao.clienteId).maybeSingle(),
  ]);
  const nomesPorId = new Map(((servicos.data ?? []) as { id: string; nome: string }[]).map((s) => [s.id, s.nome]));
  const nomes = p.servicoIds.map((id) => nomesPorId.get(id) ?? "Serviço");
  const { data, hora } = partesSaoPaulo(r.inicio);
  const valorTotal = Number(r.valor_total);
  const resumoBase = { servicos: nomes, data, hora, duracaoMin: r.duracao_total, valorTotal };

  const c = cliente.data as { nome: string; email: string | null } | null;
  let emailMascarado: string | null = null;
  if (c?.email) {
    const envio = await sendEmail({
      to: c.email,
      subject: `${remarcar && !antigoNaoCancelado ? "Remarcado" : "Agendado"}: ${rotuloDia(data)} às ${hora} — StudiOLD`,
      html:
        `<p>Olá, ${escaparHtml(c.nome)}! Seu horário na StudiOLD ${remarcar && !antigoNaoCancelado ? "foi remarcado" : "está marcado"}.</p>` +
        `<p><strong>${escaparHtml(rotuloDia(data))} às ${hora}</strong></p>` +
        `<ul>${nomes.map((n) => `<li>${escaparHtml(n)}</li>`).join("")}</ul>` +
        `<p>Total: ${escaparHtml(fmtPreco(valorTotal))} · ${r.duracao_total} min</p>`,
    });
    if (envio.ok) emailMascarado = mascararEmail(c.email);
    else console.error("[agendar/confirmarAgendamento/email]", envio.error);
  }

  return { ok: true, resumo: { ...resumoBase, emailMascarado, remarcado: !!remarcar, antigoNaoCancelado } };
}

export async function cancelarAgendamento(id: string): Promise<{ ok: true } | FalhaAgendar> {
  const sessao = await lerSessao();
  if (!sessao) return SEM_SESSAO;

  // fn_cancelar_agendamento_v2 cancela qualquer id: o dono é conferido aqui.
  const ag = await lerAgendamentoDoCliente(sessao.clienteId, id);
  if (!ag) return NAO_ENCONTRADO;
  if (!ehRemarcavel(ag, Date.now())) {
    return { ok: false, error: "Esse agendamento já não pode ser cancelado." };
  }

  const rpc = await tenantDb().rpc("fn_cancelar_agendamento_v2", {
    p_agendamento_id: ag.id,
    p_motivo: "cliente",
    p_descricao: null,
    p_origem: "site",
  });
  if (rpc.error) {
    // Corrida entre abas: outro pedido já cancelou/concluiu.
    if (rpc.error.message.includes("não pode ser cancelado")) {
      console.error("[agendar/cancelarAgendamento]", rpc.error.message);
      return { ok: false, error: "Esse agendamento já não pode ser cancelado." };
    }
    return erroInterno("cancelarAgendamento", rpc.error.message);
  }
  return { ok: true };
}
