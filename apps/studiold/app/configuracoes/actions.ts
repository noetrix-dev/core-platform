"use server";

// Server Actions da tela de configurações. Persistem no schema do tenant e
// revalidam a rota. Toda entrada é validada aqui (limite do servidor).

import { revalidatePath } from "next/cache";
import { tenantDb } from "@/lib/supabase/server";

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

// --- cortesias -------------------------------------------------------------

export async function criarCortesia(fd: FormData): Promise<void> {
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

// --- estilos de música --------------------------------------------------

export async function criarEstilo(fd: FormData): Promise<void> {
  const nome = texto(fd, "nome");
  if (!nome) return;
  const { error } = await tenantDb().from("estilos_musica").insert({ nome });
  if (error) throw new Error(`criarEstilo: ${error.message}`);
  revalidatePath(ROTA);
}

export async function editarEstilo(fd: FormData): Promise<void> {
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
  const id = idDe(fd);
  const ativo = fd.get("ativo") === "true";
  const { error } = await tenantDb()
    .from("estilos_musica")
    .update({ ativo })
    .eq("id", id);
  if (error) throw new Error(`toggleEstiloAtivo: ${error.message}`);
  revalidatePath(ROTA);
}
