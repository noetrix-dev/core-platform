"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { financasDb } from "@/lib/supabase/server";

export type Resultado = { ok: true } | { ok: false; erro: string };

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const num = (fd: FormData, k: string) => {
  const v = str(fd, k).replace(/\./g, "").replace(",", ".");
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

export async function criarConta(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const name = str(fd, "name");
    const bank = str(fd, "bank");
    const type = str(fd, "type");
    if (!name || !bank || !type) return { ok: false, erro: "Preencha nome, banco e tipo." };
    const balanceRaw = str(fd, "balance");
    const balance = balanceRaw ? num(fd, "balance") : 0;
    if (Number.isNaN(balance)) return { ok: false, erro: "Saldo inválido." };

    const { error } = await financasDb()
      .from("fin_accounts")
      .insert({ name, bank, type, balance });
    if (error) throw error;

    revalidatePath("/configuracoes");
    return { ok: true };
  } catch (e) {
    console.error("criarConta", e);
    return { ok: false, erro: "Não foi possível salvar a conta." };
  }
}

export async function editarConta(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const id = str(fd, "id");
    const name = str(fd, "name");
    const bank = str(fd, "bank");
    const type = str(fd, "type");
    const ativo = str(fd, "ativo") === "true";
    if (!id || !name || !bank || !type) {
      return { ok: false, erro: "Preencha nome, banco e tipo." };
    }
    const balanceRaw = str(fd, "balance");
    if (!balanceRaw) return { ok: false, erro: "Preencha o saldo." };
    const balance = num(fd, "balance");
    if (Number.isNaN(balance)) return { ok: false, erro: "Saldo inválido." };

    const update: Record<string, unknown> = {
      name,
      bank,
      type,
      balance,
      ativo,
      balance_updated_at: new Date().toISOString(),
    };

    // fatura_atual/limite_disponivel só existem para cartão Nubank/Inter —
    // só lê e grava esses campos quando o banco é um desses dois.
    if (bank === "nubank" || bank === "inter") {
      const faturaRaw = str(fd, "fatura_atual");
      const limiteRaw = str(fd, "limite_disponivel");
      if (faturaRaw) {
        const fatura = num(fd, "fatura_atual");
        if (Number.isNaN(fatura)) return { ok: false, erro: "Fatura atual inválida." };
        update.fatura_atual = fatura;
      } else {
        update.fatura_atual = null;
      }
      if (limiteRaw) {
        const limite = num(fd, "limite_disponivel");
        if (Number.isNaN(limite)) return { ok: false, erro: "Limite disponível inválido." };
        update.limite_disponivel = limite;
      } else {
        update.limite_disponivel = null;
      }
    }

    const { error } = await financasDb().from("fin_accounts").update(update).eq("id", id);
    if (error) throw error;

    revalidatePath("/configuracoes");
    return { ok: true };
  } catch (e) {
    console.error("editarConta", e);
    return { ok: false, erro: "Não foi possível salvar a conta." };
  }
}

export async function criarCategoria(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const name = str(fd, "name");
    const type = str(fd, "type");
    if (!name || !type) return { ok: false, erro: "Preencha nome e tipo." };
    const bucketRaw = str(fd, "bucket");
    const bucket = type === "income" ? null : bucketRaw || null;

    const { error } = await financasDb()
      .from("fin_categories")
      .insert({ name, type, bucket });
    if (error) throw error;

    revalidatePath("/configuracoes");
    return { ok: true };
  } catch (e) {
    console.error("criarCategoria", e);
    return { ok: false, erro: "Não foi possível salvar a categoria." };
  }
}

export async function editarCategoria(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const id = str(fd, "id");
    const name = str(fd, "name");
    const type = str(fd, "type");
    const ativo = str(fd, "ativo") === "true";
    if (!id || !name || !type) return { ok: false, erro: "Preencha nome e tipo." };
    const bucketRaw = str(fd, "bucket");
    const bucket = type === "income" ? null : bucketRaw || null;

    const { error } = await financasDb()
      .from("fin_categories")
      .update({ name, type, bucket, ativo })
      .eq("id", id);
    if (error) throw error;

    revalidatePath("/configuracoes");
    return { ok: true };
  } catch (e) {
    console.error("editarCategoria", e);
    return { ok: false, erro: "Não foi possível salvar a categoria." };
  }
}

export async function criarSubcategoria(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const category_id = str(fd, "category_id");
    const name = str(fd, "name");
    if (!category_id || !name) return { ok: false, erro: "Preencha categoria e nome." };

    const { error } = await financasDb()
      .from("fin_subcategories")
      .insert({ category_id, name });
    if (error) throw error;

    revalidatePath("/configuracoes");
    return { ok: true };
  } catch (e) {
    console.error("criarSubcategoria", e);
    return { ok: false, erro: "Não foi possível salvar a subcategoria." };
  }
}

export async function toggleSubcategoria(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const id = str(fd, "id");
    if (!id) return { ok: false, erro: "Subcategoria inválida." };
    const ativo = str(fd, "ativo") === "true";

    const { error } = await financasDb()
      .from("fin_subcategories")
      .update({ ativo })
      .eq("id", id);
    if (error) throw error;

    revalidatePath("/configuracoes");
    return { ok: true };
  } catch (e) {
    console.error("toggleSubcategoria", e);
    return { ok: false, erro: "Não foi possível atualizar a subcategoria." };
  }
}

export async function criarTemplate(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const description = str(fd, "description");
    const movement = str(fd, "movement");
    if (!description || !movement) {
      return { ok: false, erro: "Preencha descrição e movimento." };
    }
    const amount = num(fd, "amount");
    if (Number.isNaN(amount) || amount <= 0) return { ok: false, erro: "Valor inválido." };

    const dayRaw = str(fd, "day_of_month");
    const day_of_month = Number(dayRaw);
    if (!Number.isInteger(day_of_month) || day_of_month < 1 || day_of_month > 31) {
      return { ok: false, erro: "Dia do mês inválido." };
    }

    const category_id = str(fd, "category_id") || null;
    const subcategory_id = str(fd, "subcategory_id") || null;
    const account_id = str(fd, "account_id") || null;
    const type = str(fd, "type") || undefined;

    const { error } = await financasDb().from("fin_recurring_templates").insert({
      description,
      amount,
      movement,
      day_of_month,
      category_id,
      subcategory_id,
      account_id,
      type,
    });
    if (error) throw error;

    revalidatePath("/configuracoes");
    return { ok: true };
  } catch (e) {
    console.error("criarTemplate", e);
    return { ok: false, erro: "Não foi possível salvar o template." };
  }
}

export async function editarTemplate(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const id = str(fd, "id");
    const description = str(fd, "description");
    const movement = str(fd, "movement");
    const ativo = str(fd, "ativo") === "true";
    if (!id || !description || !movement) {
      return { ok: false, erro: "Preencha descrição e movimento." };
    }
    const amount = num(fd, "amount");
    if (Number.isNaN(amount) || amount <= 0) return { ok: false, erro: "Valor inválido." };

    const dayRaw = str(fd, "day_of_month");
    const day_of_month = Number(dayRaw);
    if (!Number.isInteger(day_of_month) || day_of_month < 1 || day_of_month > 31) {
      return { ok: false, erro: "Dia do mês inválido." };
    }

    const category_id = str(fd, "category_id") || null;
    const subcategory_id = str(fd, "subcategory_id") || null;
    const account_id = str(fd, "account_id") || null;
    const type = str(fd, "type") || undefined;

    const { error } = await financasDb()
      .from("fin_recurring_templates")
      .update({
        description,
        amount,
        movement,
        day_of_month,
        category_id,
        subcategory_id,
        account_id,
        type,
        ativo,
      })
      .eq("id", id);
    if (error) throw error;

    revalidatePath("/configuracoes");
    return { ok: true };
  } catch (e) {
    console.error("editarTemplate", e);
    return { ok: false, erro: "Não foi possível salvar o template." };
  }
}

export async function salvarMetricaNoetrix(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const mes = str(fd, "mes");
    if (!/^\d{4}-\d{2}$/.test(mes)) return { ok: false, erro: "Mês inválido." };

    const mrrRaw = str(fd, "mrr");
    if (!mrrRaw) return { ok: false, erro: "Preencha o MRR." };
    const mrr = num(fd, "mrr");
    if (Number.isNaN(mrr)) return { ok: false, erro: "MRR inválido." };

    const clientesRaw = str(fd, "clientes_pagantes");
    if (!clientesRaw) return { ok: false, erro: "Preencha o número de clientes pagantes." };
    const clientes_pagantes = num(fd, "clientes_pagantes");
    if (Number.isNaN(clientes_pagantes)) {
      return { ok: false, erro: "Número de clientes pagantes inválido." };
    }

    const churnRaw = str(fd, "churn_pct");
    const churn_pct = churnRaw ? num(fd, "churn_pct") : null;
    if (churn_pct !== null && Number.isNaN(churn_pct)) {
      return { ok: false, erro: "Churn inválido." };
    }

    const reservaRaw = str(fd, "reserva_meses");
    const reserva_meses = reservaRaw ? num(fd, "reserva_meses") : null;
    if (reserva_meses !== null && Number.isNaN(reserva_meses)) {
      return { ok: false, erro: "Reserva em meses inválida." };
    }

    const { error } = await financasDb()
      .from("fin_noetrix_metrics")
      .upsert(
        {
          mes: `${mes}-01`,
          mrr,
          clientes_pagantes,
          churn_pct,
          reserva_meses,
        },
        { onConflict: "user_id,mes" },
      );
    if (error) throw error;

    revalidatePath("/configuracoes");
    revalidatePath("/cockpit");
    return { ok: true };
  } catch (e) {
    console.error("salvarMetricaNoetrix", e);
    return { ok: false, erro: "Não foi possível salvar a métrica." };
  }
}
