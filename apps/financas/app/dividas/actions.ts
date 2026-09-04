"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { financasDb } from "@/lib/supabase/server";
import { hojeISO } from "@/lib/datas";
import type { Grupo } from "@/lib/financas/types";

export type Resultado = { ok: true } | { ok: false; erro: string };

const GRUPOS: Grupo[] = ["fgts", "consignado", "serasa", "pessoal", "familia", "cartao"];

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const num = (fd: FormData, k: string) => {
  const n = Number(str(fd, k).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export async function registrarPagamentoDivida(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const p_debt_id = str(fd, "debt_id");
    const p_amount = num(fd, "amount");
    const p_account_id = str(fd, "account_id") || null;
    const p_due_date = str(fd, "due_date") || hojeISO();
    const p_status = str(fd, "status") || "paid";
    if (!p_debt_id) return { ok: false, erro: "Dívida não informada." };
    if (!(p_amount > 0)) return { ok: false, erro: "Valor inválido." };

    const { error } = await financasDb().rpc("fn_registrar_pagamento_divida", {
      p_debt_id,
      p_amount,
      p_account_id,
      p_due_date,
      p_status,
    });
    if (error) throw error;

    revalidatePath("/dividas");
    revalidatePath("/cockpit");
    revalidatePath("/lancamentos");
    return { ok: true };
  } catch (e) {
    console.error("registrarPagamentoDivida", e);
    return { ok: false, erro: "Não foi possível registrar o pagamento." };
  }
}

export async function criarDivida(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const creditor = str(fd, "creditor");
    const grupo = str(fd, "grupo");
    const total_amount = num(fd, "total_amount");
    if (!creditor || !grupo) return { ok: false, erro: "Preencha credor e grupo." };
    if (!GRUPOS.includes(grupo as Grupo)) return { ok: false, erro: "Grupo inválido." };
    if (!(total_amount > 0)) return { ok: false, erro: "Valor total inválido." };

    const remainingRaw = str(fd, "remaining_amount");
    const remaining_amount = remainingRaw ? num(fd, "remaining_amount") : total_amount;
    if (Number.isNaN(remaining_amount)) return { ok: false, erro: "Valor restante inválido." };

    const monthlyRaw = str(fd, "monthly_payment");
    const monthly_payment = monthlyRaw ? num(fd, "monthly_payment") : null;
    if (monthly_payment !== null && Number.isNaN(monthly_payment)) {
      return { ok: false, erro: "Parcela mensal inválida." };
    }

    const dueDayRaw = str(fd, "due_day");
    const due_day = dueDayRaw ? Math.trunc(num(fd, "due_day")) : null;
    if (due_day !== null && (!Number.isInteger(due_day) || due_day < 1 || due_day > 31)) {
      return { ok: false, erro: "Dia de vencimento inválido." };
    }

    const { error } = await financasDb().from("fin_debts").insert({
      creditor,
      grupo,
      total_amount,
      remaining_amount,
      monthly_payment,
      due_day,
    });
    if (error) throw error;

    revalidatePath("/dividas");
    return { ok: true };
  } catch (e) {
    console.error("criarDivida", e);
    return { ok: false, erro: "Não foi possível salvar a dívida." };
  }
}

export async function editarDivida(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const id = str(fd, "id");
    if (!id) return { ok: false, erro: "Dívida inválida." };

    const creditor = str(fd, "creditor");
    const grupo = str(fd, "grupo");
    const total_amount = num(fd, "total_amount");
    if (!creditor || !grupo) return { ok: false, erro: "Preencha credor e grupo." };
    if (!GRUPOS.includes(grupo as Grupo)) return { ok: false, erro: "Grupo inválido." };
    if (!(total_amount > 0)) return { ok: false, erro: "Valor total inválido." };

    const remainingRaw = str(fd, "remaining_amount");
    if (!remainingRaw) return { ok: false, erro: "Preencha o valor restante." };
    const remaining_amount = num(fd, "remaining_amount");
    if (Number.isNaN(remaining_amount)) return { ok: false, erro: "Valor restante inválido." };

    const status = str(fd, "status") === "quitada" ? "quitada" : "ativa";

    const monthlyRaw = str(fd, "monthly_payment");
    const monthly_payment = monthlyRaw ? num(fd, "monthly_payment") : null;
    if (monthly_payment !== null && Number.isNaN(monthly_payment)) {
      return { ok: false, erro: "Parcela mensal inválida." };
    }

    const dueDayRaw = str(fd, "due_day");
    const due_day = dueDayRaw ? Math.trunc(num(fd, "due_day")) : null;
    if (due_day !== null && (!Number.isInteger(due_day) || due_day < 1 || due_day > 31)) {
      return { ok: false, erro: "Dia de vencimento inválido." };
    }

    const { error } = await financasDb()
      .from("fin_debts")
      .update({
        creditor,
        grupo,
        total_amount,
        remaining_amount,
        status,
        monthly_payment,
        due_day,
      })
      .eq("id", id);
    if (error) throw error;

    revalidatePath("/dividas");
    return { ok: true };
  } catch (e) {
    console.error("editarDivida", e);
    return { ok: false, erro: "Não foi possível salvar a dívida." };
  }
}
