"use server";

// Server Actions do perfil de cliente. tenantDb() = schema do tenant,
// service-role, só servidor.

import { revalidatePath } from "next/cache";

import { tenantDb } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import { resumirAtendimentos, type AtendimentoRow } from "@/lib/clientes/resumo";
import { normalizarTelefone } from "@/lib/clientes/telefone";
import { limparEmail } from "@/lib/clientes/email";
import type {
  PerfilResultado,
  PreferenciasPatch,
  CriarClienteResultado,
  PreferenciasResultado,
} from "@/lib/clientes/types";

const UUID = /^[0-9a-f-]{36}$/i;
const uuidOrNull = (v: string | null): string | null =>
  v && UUID.test(v) ? v : null;

type Row = Record<string, unknown>;
function embNome(v: unknown): string {
  const o = Array.isArray(v) ? v[0] : v;
  return ((o as { nome?: string } | null)?.nome ?? "Serviço") as string;
}

export async function getPerfilCliente(
  clienteId: string,
): Promise<PerfilResultado> {
  await requireUser();
  if (!UUID.test(clienteId)) return { ok: false, error: "id inválido" };
  const db = tenantDb();

  const [cliRes, atendRes, cortRes, estRes] = await Promise.all([
    db
      .from("clientes")
      .select(
        "id, nome, telefone, email, cortesia_favorita_id, estilo_musica_id, observacoes_fixas",
      )
      .eq("id", clienteId)
      .maybeSingle(),
    db
      .from("atendimentos")
      .select("realizado_em, valor_cobrado, forma_pagamento, servico_id, servicos(nome)")
      .eq("cliente_id", clienteId)
      .order("realizado_em", { ascending: false }),
    db.from("cortesias").select("id, nome").eq("ativo", true).order("nome"),
    db.from("estilos_musica").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  if (cliRes.error) return { ok: false, error: `perfil/cliente: ${cliRes.error.message}` };
  if (!cliRes.data) return { ok: false, error: "Cliente não encontrado." };
  if (atendRes.error) return { ok: false, error: `perfil/atendimentos: ${atendRes.error.message}` };
  if (cortRes.error) return { ok: false, error: `perfil/cortesias: ${cortRes.error.message}` };
  if (estRes.error) return { ok: false, error: `perfil/estilos: ${estRes.error.message}` };

  const rows: AtendimentoRow[] = ((atendRes.data ?? []) as Row[]).map((a) => ({
    realizado_em: a.realizado_em as string,
    valor_cobrado: Number(a.valor_cobrado) || 0,
    forma_pagamento: (a.forma_pagamento as string) ?? "",
    servico_id: (a.servico_id as string) ?? "",
    servico_nome: embNome(a.servicos),
  }));

  const c = cliRes.data as Row;
  return {
    ok: true,
    perfil: {
      id: c.id as string,
      nome: c.nome as string,
      telefone: c.telefone as string,
      email: (c.email as string) ?? null,
      cortesia_favorita_id: (c.cortesia_favorita_id as string) ?? null,
      estilo_musica_id: (c.estilo_musica_id as string) ?? null,
      observacoes_fixas: (c.observacoes_fixas as string) ?? null,
      resumo: resumirAtendimentos(rows),
      cortesias_ativas: ((cortRes.data ?? []) as Row[]).map((x) => ({
        id: x.id as string,
        nome: x.nome as string,
      })),
      estilos_ativos: ((estRes.data ?? []) as Row[]).map((x) => ({
        id: x.id as string,
        nome: x.nome as string,
      })),
    },
  };
}

export async function atualizarPreferencias(
  clienteId: string,
  patch: PreferenciasPatch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  if (!UUID.test(clienteId)) return { ok: false, error: "id inválido" };
  const obs = (patch.observacoesFixas ?? "").trim().slice(0, 500) || null;
  const { error } = await tenantDb()
    .from("clientes")
    .update({
      cortesia_favorita_id: uuidOrNull(patch.cortesiaFavoritaId),
      estilo_musica_id: uuidOrNull(patch.estiloMusicaId),
      observacoes_fixas: obs,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", clienteId);
  return error
    ? { ok: false, error: `atualizarPreferencias: ${error.message}` }
    : { ok: true };
}

const GENEROS = new Set(["masculino", "feminino", "infantil", "nao_informado"]);

export async function criarCliente(
  fd: FormData,
): Promise<CriarClienteResultado> {
  await requireUser();
  const nome = (fd.get("nome") ?? "").toString().trim().slice(0, 120);
  if (!nome) return { ok: false, error: "Informe o nome do cliente." };

  const telefone = normalizarTelefone((fd.get("telefone") ?? "").toString());
  if (!telefone) {
    return { ok: false, error: "Telefone inválido. Use DDD + número." };
  }

  const generoRaw = (fd.get("genero") ?? "nao_informado").toString();
  const genero = GENEROS.has(generoRaw) ? generoRaw : "nao_informado";

  const email = limparEmail((fd.get("email") ?? "").toString());
  if (email === "invalido") {
    return { ok: false, error: "E-mail inválido." };
  }

  const db = tenantDb();

  // ponytail: sem filtro de ativo — quando soft-delete existir, re-cadastrar o telefone de um
  // cliente inativo vai bater UNIQUE e abrir um perfil que não está na lista. Fixar aí.
  const dup = await db
    .from("clientes")
    .select("id")
    .eq("telefone", telefone)
    .maybeSingle();
  if (dup.error) {
    return { ok: false, error: `criarCliente/dup: ${dup.error.message}` };
  }
  if (dup.data) {
    return {
      ok: false,
      error: "Já existe cliente com esse telefone.",
      clienteExistenteId: (dup.data as { id: string }).id,
    };
  }

  const ins = await db
    .from("clientes")
    .insert({ nome, telefone, genero, email })
    .select("id")
    .single();
  if (ins.error) {
    // corrida no UNIQUE(telefone) entre o check acima e o insert
    if (ins.error.code === "23505") {
      const again = await db
        .from("clientes")
        .select("id")
        .eq("telefone", telefone)
        .maybeSingle();
      const existenteId = (again.data as { id: string } | null)?.id;
      return existenteId
        ? {
            ok: false,
            error: "Já existe cliente com esse telefone.",
            clienteExistenteId: existenteId,
          }
        : { ok: false, error: "Já existe cliente com esse telefone." };
    }
    return { ok: false, error: `criarCliente: ${ins.error.message}` };
  }

  revalidatePath("/clientes");
  return { ok: true, id: (ins.data as { id: string }).id };
}

export async function getPreferenciasCliente(
  clienteId: string,
): Promise<PreferenciasResultado> {
  await requireUser();
  if (!UUID.test(clienteId)) return { ok: false, error: "id inválido" };
  const db = tenantDb();

  const [cliRes, cortRes, estRes] = await Promise.all([
    db
      .from("clientes")
      .select("cortesia_favorita_id, estilo_musica_id, observacoes_fixas")
      .eq("id", clienteId)
      .maybeSingle(),
    db.from("cortesias").select("id, nome"),
    db.from("estilos_musica").select("id, nome"),
  ]);

  if (cliRes.error) {
    return { ok: false, error: `getPreferenciasCliente: ${cliRes.error.message}` };
  }
  if (!cliRes.data) return { ok: false, error: "Cliente não encontrado." };
  if (cortRes.error) {
    return { ok: false, error: `getPreferenciasCliente/cortesias: ${cortRes.error.message}` };
  }
  if (estRes.error) {
    return { ok: false, error: `getPreferenciasCliente/estilos: ${estRes.error.message}` };
  }

  const c = cliRes.data as Row;
  const nomePorId = (rows: Row[], id: string | null): string | null => {
    if (!id) return null;
    const hit = rows.find((r) => (r.id as string) === id);
    return hit ? (hit.nome as string) : null;
  };
  const cortesias = (cortRes.data ?? []) as Row[];
  const estilos = (estRes.data ?? []) as Row[];
  const cortesiaFavoritaId = (c.cortesia_favorita_id as string) ?? null;

  return {
    ok: true,
    prefs: {
      cortesiaFavoritaId,
      cortesiaNome: nomePorId(cortesias, cortesiaFavoritaId),
      estiloNome: nomePorId(estilos, (c.estilo_musica_id as string) ?? null),
      observacoesFixas: (c.observacoes_fixas as string) ?? null,
    },
  };
}
