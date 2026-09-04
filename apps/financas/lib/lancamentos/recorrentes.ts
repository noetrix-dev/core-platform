import { fimDoMesISO } from "../datas.ts";
import type { NovaTransacao, TemplateRow } from "../financas/types.ts";

export type ExistenteRef = {
  recurring_template_id: string | null;
  due_date: string;
};

export function gerarTransacoesDoMes(
  templates: TemplateRow[],
  existentes: ExistenteRef[],
  mesAlvo: { ano: number; mes: number },
): NovaTransacao[] {
  const mm = String(mesAlvo.mes).padStart(2, "0");
  const prefixo = `${mesAlvo.ano}-${mm}`;
  const ultimoDia = Number(fimDoMesISO(`${prefixo}-01`).slice(-2));

  const jaTem = new Set(
    existentes
      .filter((e) => e.recurring_template_id && e.due_date.startsWith(prefixo))
      .map((e) => e.recurring_template_id as string),
  );

  const linhas: NovaTransacao[] = [];
  for (const t of templates) {
    if (!t.ativo) continue;
    if (jaTem.has(t.id)) continue;
    const dia = Math.min(t.day_of_month, ultimoDia);
    linhas.push({
      description: t.description,
      amount: t.amount,
      movement: t.movement,
      type: t.type,
      status: "pending",
      due_date: `${prefixo}-${String(dia).padStart(2, "0")}`,
      account_id: t.account_id,
      category_id: t.category_id,
      subcategory_id: t.subcategory_id,
      is_recurring: true,
      recurring_template_id: t.id,
      source: "manual",
    });
  }
  return linhas;
}
