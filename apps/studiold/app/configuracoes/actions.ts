"use server";

// Server Actions da tela de configurações. Persistem no schema do tenant e
// revalidam a rota. Toda entrada é validada aqui (limite do servidor).

import { revalidatePath } from "next/cache";
import { tenantDb } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import { parsePrecoBRL } from "@/lib/dinheiro";
import { DIAS_SEMANA_LONGO } from "@/lib/agenda/time";

const ROTA = "/configuracoes";

function texto(fd: FormData, campo: string, max = 120): string {
  const v = (fd.get(campo) ?? "").toString().trim();
  if (v.length > max) return v.slice(0, max);
  return v;
}

function idDe(fd: FormData): string {
  const id = (fd.get("id") ?? "").toString();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("id inválido");
  return id;
}

function inteiro(fd: FormData, campo: string): number | null {
  const n = Number(fd.get(campo));
  return Number.isInteger(n) ? n : null;
}

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

// --- cortesias -------------------------------------------------------------

export async function criarCortesia(fd: FormData): Promise<void> {
  await requireUser();
  const nome = texto(fd, "nome");
  if (!nome) return;
  const descricao = texto(fd, "descricao", 280);
  const { error } = await tenantDb()
    .from("cortesias")
    .insert({ nome, descricao: descricao || null });
  if (error) throw new Error(`criarCortesia: ${error.message}`);
  revalidatePath(ROTA);
}

export async function editarCortesia(fd: FormData): Promise<void> {
  await requireUser();
  const id = idDe(fd);
  const nome = texto(fd, "nome");
  if (!nome) return;
  const descricao = texto(fd, "descricao", 280);
  const { error } = await tenantDb()
    .from("cortesias")
    .update({ nome, descricao: descricao || null })
    .eq("id", id);
  if (error) throw new Error(`editarCortesia: ${error.message}`);
  revalidatePath(ROTA);
}

export async function toggleCortesiaAtivo(fd: FormData): Promise<void> {
  await requireUser();
  const id = idDe(fd);
  const ativo = fd.get("ativo") === "true";
  const { error } = await tenantDb()
    .from("cortesias")
    .update({ ativo })
    .eq("id", id);
  if (error) throw new Error(`toggleCortesiaAtivo: ${error.message}`);
  revalidatePath(ROTA);
}

export async function adicionarEstoque(fd: FormData): Promise<void> {
  await requireUser();
  const id = idDe(fd);
  const n = Number(fd.get("n"));
  if (!Number.isInteger(n) || n <= 0 || n > 10_000) return;
  const db = tenantDb();
  const atual = await db
    .from("cortesias")
    .select("quantidade_estoque")
    .eq("id", id)
    .single();
  if (atual.error) throw new Error(`adicionarEstoque/ler: ${atual.error.message}`);
  // ponytail: read-modify-write; corrida irrelevante numa tela de config de um operador
  const novo = ((atual.data.quantidade_estoque as number) ?? 0) + n;
  const { error } = await db
    .from("cortesias")
    .update({ quantidade_estoque: novo })
    .eq("id", id);
  if (error) throw new Error(`adicionarEstoque: ${error.message}`);
  revalidatePath(ROTA);
}

/** define a quantidade absoluta (edição inline do número). */
export async function definirEstoque(
  id: string,
  quantidade: number,
): Promise<void> {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("id inválido");
  if (!Number.isInteger(quantidade) || quantidade < 0 || quantidade > 100_000) {
    return;
  }
  const { error } = await tenantDb()
    .from("cortesias")
    .update({ quantidade_estoque: quantidade })
    .eq("id", id);
  if (error) throw new Error(`definirEstoque: ${error.message}`);
  revalidatePath(ROTA);
}

// --- estilos de música --------------------------------------------------

export async function criarEstilo(fd: FormData): Promise<void> {
  await requireUser();
  const nome = texto(fd, "nome");
  if (!nome) return;
  const { error } = await tenantDb().from("estilos_musica").insert({ nome });
  if (error) throw new Error(`criarEstilo: ${error.message}`);
  revalidatePath(ROTA);
}

export async function editarEstilo(fd: FormData): Promise<void> {
  await requireUser();
  const id = idDe(fd);
  const nome = texto(fd, "nome");
  if (!nome) return;
  const { error } = await tenantDb()
    .from("estilos_musica")
    .update({ nome })
    .eq("id", id);
  if (error) throw new Error(`editarEstilo: ${error.message}`);
  revalidatePath(ROTA);
}

export async function toggleEstiloAtivo(fd: FormData): Promise<void> {
  await requireUser();
  const id = idDe(fd);
  const ativo = fd.get("ativo") === "true";
  const { error } = await tenantDb()
    .from("estilos_musica")
    .update({ ativo })
    .eq("id", id);
  if (error) throw new Error(`toggleEstiloAtivo: ${error.message}`);
  revalidatePath(ROTA);
}

// --- serviços ---------------------------------------------------------

export async function criarServico(fd: FormData): Promise<void> {
  await requireUser();
  const nome = texto(fd, "nome");
  const preco = parsePrecoBRL((fd.get("preco") ?? "").toString());
  const dur = inteiro(fd, "duracao_minutos");
  if (!nome || preco == null || dur == null || dur < 1 || dur > 600) return;
  const { error } = await tenantDb()
    .from("servicos")
    .insert({ nome, preco, duracao_minutos: dur });
  if (error) throw new Error(`criarServico: ${error.message}`);
  revalidatePath(ROTA);
}

export async function editarServico(fd: FormData): Promise<void> {
  await requireUser();
  const id = idDe(fd);
  const nome = texto(fd, "nome");
  const preco = parsePrecoBRL((fd.get("preco") ?? "").toString());
  const dur = inteiro(fd, "duracao_minutos");
  if (!nome || preco == null || dur == null || dur < 1 || dur > 600) return;
  const { error } = await tenantDb()
    .from("servicos")
    .update({ nome, preco, duracao_minutos: dur })
    .eq("id", id);
  if (error) throw new Error(`editarServico: ${error.message}`);
  revalidatePath(ROTA);
}

export async function toggleServicoAtivo(fd: FormData): Promise<void> {
  await requireUser();
  const id = idDe(fd);
  const ativo = fd.get("ativo") === "true";
  const { error } = await tenantDb()
    .from("servicos")
    .update({ ativo })
    .eq("id", id);
  if (error) throw new Error(`toggleServicoAtivo: ${error.message}`);
  revalidatePath(ROTA);
}

// --- horário de funcionamento --------------------------------------

type DiaPayload = {
  dia_semana: number;
  aberto: boolean;
  hora_abertura: string;
  hora_fechamento: string;
};
type AlmocoPayload = { id: string; hora_inicio: string; hora_fim: string } | null;

export async function salvarHorarios(
  dias: DiaPayload[],
  almoco: AlmocoPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  if (!Array.isArray(dias) || dias.length !== 7) {
    return { ok: false, error: "payload inválido" };
  }
  for (const d of dias) {
    if (!Number.isInteger(d.dia_semana) || d.dia_semana < 0 || d.dia_semana > 6) {
      return { ok: false, error: "dia da semana inválido" };
    }
    if (d.aberto) {
      if (!HM.test(d.hora_abertura) || !HM.test(d.hora_fechamento)) {
        return {
          ok: false,
          error: `Preencha os horários de ${DIAS_SEMANA_LONGO[d.dia_semana]}.`,
        };
      }
      if (d.hora_abertura >= d.hora_fechamento) {
        return {
          ok: false,
          error: `Em ${DIAS_SEMANA_LONGO[d.dia_semana]}, a abertura deve ser antes do fechamento.`,
        };
      }
    }
  }
  if (almoco) {
    if (!/^[0-9a-f-]{36}$/i.test(almoco.id)) {
      return { ok: false, error: "id do almoço inválido" };
    }
    if (
      !HM.test(almoco.hora_inicio) ||
      !HM.test(almoco.hora_fim) ||
      almoco.hora_inicio >= almoco.hora_fim
    ) {
      return { ok: false, error: "Horário do almoço inválido." };
    }
  }

  const db = tenantDb();
  for (const d of dias) {
    const { error } = await db
      .from("horarios_funcionamento")
      .update({
        aberto: d.aberto,
        hora_abertura: d.aberto ? d.hora_abertura : null,
        hora_fechamento: d.aberto ? d.hora_fechamento : null,
      })
      .eq("dia_semana", d.dia_semana);
    if (error) {
      console.error(`salvarHorarios/dia ${d.dia_semana}:`, error.message);
      return { ok: false, error: "Não foi possível salvar os horários. Tente de novo." };
    }
  }
  if (almoco) {
    const { error } = await db
      .from("bloqueios_fixos")
      .update({ hora_inicio: almoco.hora_inicio, hora_fim: almoco.hora_fim })
      .eq("id", almoco.id);
    if (error) {
      console.error(`salvarHorarios/almoço:`, error.message);
      return { ok: false, error: "Não foi possível salvar os horários. Tente de novo." };
    }
  }
  revalidatePath(ROTA);
  return { ok: true };
}

// --- produtos ---------------------------------------------------------

export async function criarProduto(fd: FormData): Promise<void> {
  await requireUser();
  const nome = texto(fd, "nome");
  const preco = parsePrecoBRL((fd.get("preco_venda") ?? "").toString());
  const descricao = texto(fd, "descricao", 280);
  if (!nome || preco == null) return;
  const est = Number(fd.get("quantidade_estoque"));
  const estoque = Number.isInteger(est) && est >= 0 && est <= 100_000 ? est : 0;
  const { error } = await tenantDb()
    .from("produtos")
    .insert({ nome, preco_venda: preco, descricao: descricao || null, quantidade_estoque: estoque });
  if (error) throw new Error(`criarProduto: ${error.message}`);
  revalidatePath(ROTA);
}

export async function editarProduto(fd: FormData): Promise<void> {
  await requireUser();
  const id = idDe(fd);
  const nome = texto(fd, "nome");
  const preco = parsePrecoBRL((fd.get("preco_venda") ?? "").toString());
  const descricao = texto(fd, "descricao", 280);
  if (!nome || preco == null) return;
  const { error } = await tenantDb()
    .from("produtos")
    .update({ nome, preco_venda: preco, descricao: descricao || null })
    .eq("id", id);
  if (error) throw new Error(`editarProduto: ${error.message}`);
  revalidatePath(ROTA);
}

export async function toggleProdutoAtivo(fd: FormData): Promise<void> {
  await requireUser();
  const id = idDe(fd);
  const ativo = fd.get("ativo") === "true";
  const { error } = await tenantDb()
    .from("produtos")
    .update({ ativo })
    .eq("id", id);
  if (error) throw new Error(`toggleProdutoAtivo: ${error.message}`);
  revalidatePath(ROTA);
}

export async function definirProdutoEstoque(
  id: string,
  quantidade: number,
): Promise<void> {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("id inválido");
  if (!Number.isInteger(quantidade) || quantidade < 0 || quantidade > 100_000) {
    return;
  }
  const { error } = await tenantDb()
    .from("produtos")
    .update({ quantidade_estoque: quantidade })
    .eq("id", id);
  if (error) throw new Error(`definirProdutoEstoque: ${error.message}`);
  revalidatePath(ROTA);
}
