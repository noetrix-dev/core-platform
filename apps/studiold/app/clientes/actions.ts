"use server";

// Server Actions do perfil de cliente. tenantDb() = schema do tenant,
// service-role, só servidor.

import { tenantDb } from "@/lib/supabase/server";
import { resumirAtendimentos, type AtendimentoRow } from "@/lib/clientes/resumo";
import type { PerfilResultado, PreferenciasPatch } from "@/lib/clientes/types";

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
  if (!UUID.test(clienteId)) return { ok: false, error: "id inválido" };
  const db = tenantDb();

  const [cliRes, atendRes, cortRes, estRes] = await Promise.all([
    db
      .from("clientes")
      .select(
        "id, nome, telefone, cortesia_favorita_id, estilo_musica_id, observacoes_fixas",
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
