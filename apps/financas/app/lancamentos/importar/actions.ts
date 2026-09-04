"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { financasDb } from "@/lib/supabase/server";
import { parseOfx } from "@/lib/import/ofx";
import { hashTransacao, classificar } from "@/lib/import/dedupe";

export type CandidatoRevisao = {
  externalId: string;
  dataIso: string;
  valor: number;
  memo: string;
  movimentoSugerido: "income" | "expense";
  novo: boolean;
};
export type AnaliseResult =
  | { ok: true; accountId: string; candidatos: CandidatoRevisao[] }
  | { ok: false; erro: string };

export async function analisarOfx(fd: FormData): Promise<AnaliseResult> {
  await requireUser();
  try {
    const arquivo = fd.get("arquivo");
    const accountId = (fd.get("account_id") ?? "").toString().trim();
    if (!accountId) return { ok: false, erro: "Escolha a conta do extrato." };
    if (!(arquivo instanceof File) || arquivo.size === 0)
      return { ok: false, erro: "Envie um arquivo .ofx." };

    const texto = await arquivo.text();
    const transacoes = parseOfx(texto);
    if (!transacoes.length)
      return { ok: false, erro: "Nenhuma transação encontrada no arquivo." };

    const comHash = transacoes.map((t) => ({
      ...t,
      hash: hashTransacao({
        accountId,
        dataIso: t.dataIso,
        valor: t.valor,
        memo: t.memo,
      }),
    }));
    const ids = comHash.map((t) => t.fitid ?? t.hash);
    const { data: existentes, error } = await financasDb()
      .from("fin_transactions")
      .select("external_id")
      .in("external_id", ids);
    if (error) throw error;
    const jaImportados = new Set(
      (existentes ?? []).map((r) => r.external_id as string),
    );

    const classificados = classificar(
      comHash.map((t) => ({ hash: t.hash, fitid: t.fitid })),
      jaImportados,
    );

    const candidatos: CandidatoRevisao[] = comHash.map((t, i) => ({
      externalId: classificados[i].externalId,
      dataIso: t.dataIso,
      valor: t.valor,
      memo: t.memo,
      movimentoSugerido: t.movimentoSugerido,
      novo: classificados[i].novo,
    }));

    return { ok: true, accountId, candidatos };
  } catch (e) {
    console.error("analisarOfx", e);
    return { ok: false, erro: "Não foi possível ler o arquivo." };
  }
}

export type Resultado =
  | { ok: true; criados: number; ignorados: number }
  | { ok: false; erro: string };

export async function confirmarImportacao(fd: FormData): Promise<Resultado> {
  await requireUser();
  try {
    const accountId = (fd.get("account_id") ?? "").toString().trim();
    const linhas = JSON.parse((fd.get("linhas") ?? "[]").toString()) as Array<{
      externalId: string;
      dataIso: string;
      valor: number;
      memo: string;
      movement: "income" | "expense";
      category_id: string | null;
      subcategory_id: string | null;
    }>;
    if (!accountId || !linhas.length)
      return { ok: false, erro: "Nada para importar." };

    const db = financasDb();
    let criados = 0;
    let ignorados = 0;
    for (const l of linhas) {
      const { error } = await db.from("fin_transactions").insert({
        description: l.memo || "Importado",
        amount: Math.abs(l.valor),
        movement: l.movement,
        type: "variable",
        due_date: l.dataIso,
        payment_date: l.dataIso,
        status: "paid",
        account_id: accountId,
        category_id: l.category_id,
        subcategory_id: l.subcategory_id,
        source: "ofx",
        external_id: l.externalId,
      });
      if (error) {
        if (error.code === "23505") ignorados++;
        else throw error;
      } else criados++;
    }

    revalidatePath("/lancamentos");
    revalidatePath("/cockpit");
    return { ok: true, criados, ignorados };
  } catch (e) {
    console.error("confirmarImportacao", e);
    return { ok: false, erro: "Não foi possível concluir a importação." };
  }
}
