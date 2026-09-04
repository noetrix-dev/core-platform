"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/supabase/auth";
import { financasDb } from "@/lib/supabase/server";
import { expandirParcelas } from "@/lib/lancamentos/parcelas";
import { gerarTransacoesDoMes } from "@/lib/lancamentos/recorrentes";
import { hojeISO } from "@/lib/datas";
import type { Movement, TemplateRow, TxType } from "@/lib/financas/types";

export type Resultado =
  | { ok: true; criados?: number }
  | { ok: false; erro: string };

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const num = (fd: FormData, k: string) => {
  const n = Number(str(fd, k).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export async function criarLancamento(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const description = str(fd, "description");
    const amount = num(fd, "amount");
    const movement = str(fd, "movement") as Movement;
    const due_date = str(fd, "due_date");
    const type = (str(fd, "type") || "variable") as TxType;
    if (!description || !due_date) return { ok: false, erro: "Preencha descrição e vencimento." };
    if (!(amount > 0)) return { ok: false, erro: "Valor inválido." };

    const db = financasDb();
    const account_id = str(fd, "account_id") || null;
    const category_id = str(fd, "category_id") || null;
    const subcategory_id = str(fd, "subcategory_id") || null;

    if (type === "installment") {
      const parcelas = Number(str(fd, "parcelas"));
      if (!Number.isInteger(parcelas) || parcelas < 1)
        return { ok: false, erro: "Número de parcelas inválido." };
      const linhas = expandirParcelas({
        descricao: description,
        valorTotal: amount,
        primeiroVencimento: due_date,
        parcelas,
        movement,
        accountId: account_id,
        categoryId: category_id,
        subcategoryId: subcategory_id,
        groupId: randomUUID(),
      });
      const { error } = await db.from("fin_transactions").insert(linhas);
      if (error) throw error;
    } else {
      const status = str(fd, "status") === "paid" ? "paid" : "pending";
      const { error } = await db.from("fin_transactions").insert({
        description,
        amount,
        movement,
        type,
        due_date,
        status,
        payment_date: status === "paid" ? hojeISO() : null,
        account_id,
        category_id,
        subcategory_id,
        source: "manual",
      });
      if (error) throw error;
    }

    revalidatePath("/lancamentos");
    return { ok: true };
  } catch (e) {
    console.error("criarLancamento", e);
    return { ok: false, erro: "Não foi possível salvar o lançamento." };
  }
}

export async function gerarMes(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const mes = str(fd, "mes"); // "YYYY-MM"
    if (!/^\d{4}-\d{2}$/.test(mes)) return { ok: false, erro: "Mês inválido." };
    const [ano, m] = mes.split("-").map(Number);
    const db = financasDb();

    const [tpls, existentes] = await Promise.all([
      db.from("fin_recurring_templates").select("*").eq("ativo", true),
      db
        .from("fin_transactions")
        .select("recurring_template_id,due_date")
        .gte("due_date", `${mes}-01`)
        .lte("due_date", `${mes}-31`)
        .not("recurring_template_id", "is", null),
    ]);
    if (tpls.error) throw tpls.error;
    if (existentes.error) throw existentes.error;

    const novas = gerarTransacoesDoMes(
      (tpls.data ?? []) as TemplateRow[],
      existentes.data ?? [],
      { ano, mes: m },
    );
    if (novas.length) {
      const { error } = await db.from("fin_transactions").insert(novas);
      if (error) throw error;
    }

    revalidatePath("/lancamentos");
    return { ok: true, criados: novas.length };
  } catch (e) {
    console.error("gerarMes", e);
    return { ok: false, erro: "Não foi possível gerar o mês." };
  }
}

export async function mudarStatus(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const id = str(fd, "id");
    const alvo = str(fd, "status") === "paid" ? "paid" : "pending";
    const { error } = await financasDb()
      .from("fin_transactions")
      .update({
        status: alvo,
        payment_date: alvo === "paid" ? hojeISO() : null,
      })
      .eq("id", id);
    if (error) throw error;
    revalidatePath("/lancamentos");
    return { ok: true };
  } catch (e) {
    console.error("mudarStatus", e);
    return { ok: false, erro: "Não foi possível mudar o status." };
  }
}

export async function recalcularAtrasados(): Promise<Resultado> {
  await requireUser();
  try {
    const { error } = await financasDb()
      .from("fin_transactions")
      .update({ status: "overdue" })
      .eq("status", "pending")
      .lt("due_date", hojeISO());
    if (error) throw error;
    revalidatePath("/lancamentos");
    revalidatePath("/cockpit");
    return { ok: true };
  } catch (e) {
    console.error("recalcularAtrasados", e);
    return { ok: false, erro: "Não foi possível recalcular." };
  }
}

export async function editarLancamento(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const id = str(fd, "id");
    if (!id) return { ok: false, erro: "Lançamento inválido." };
    const description = str(fd, "description");
    const amount = num(fd, "amount");
    const movement = str(fd, "movement") as Movement;
    const due_date = str(fd, "due_date");
    if (!description || !due_date) return { ok: false, erro: "Preencha descrição e vencimento." };
    if (!(amount > 0)) return { ok: false, erro: "Valor inválido." };

    const account_id = str(fd, "account_id") || null;
    const category_id = str(fd, "category_id") || null;
    const subcategory_id = str(fd, "subcategory_id") || null;

    // Edita só os campos descritivos desta linha — não mexe em installment_*
    // nem nas parcelas irmãs do mesmo installment_group_id.
    const { error } = await financasDb()
      .from("fin_transactions")
      .update({
        description,
        amount,
        movement,
        due_date,
        account_id,
        category_id,
        subcategory_id,
      })
      .eq("id", id);
    if (error) throw error;

    revalidatePath("/lancamentos");
    return { ok: true };
  } catch (e) {
    console.error("editarLancamento", e);
    return { ok: false, erro: "Não foi possível salvar o lançamento." };
  }
}

export async function excluirLancamento(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const id = str(fd, "id");
    if (!id) return { ok: false, erro: "Lançamento inválido." };
    const { error } = await financasDb().from("fin_transactions").delete().eq("id", id);
    if (error) throw error;

    revalidatePath("/lancamentos");
    return { ok: true };
  } catch (e) {
    console.error("excluirLancamento", e);
    return { ok: false, erro: "Não foi possível excluir o lançamento." };
  }
}

export async function excluirGrupoParcelas(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const installment_group_id = str(fd, "installment_group_id");
    if (!installment_group_id) return { ok: false, erro: "Grupo de parcelas inválido." };
    const { error } = await financasDb()
      .from("fin_transactions")
      .delete()
      .eq("installment_group_id", installment_group_id);
    if (error) throw error;

    revalidatePath("/lancamentos");
    return { ok: true };
  } catch (e) {
    console.error("excluirGrupoParcelas", e);
    return { ok: false, erro: "Não foi possível excluir as parcelas." };
  }
}
