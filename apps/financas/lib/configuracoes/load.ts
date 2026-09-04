import "server-only";
import { financasDb } from "@/lib/supabase/server";
import type {
  AccountRow,
  CategoryRow,
  SubcategoryRow,
  TemplateRow,
  NoetrixMetricRow,
} from "@/lib/financas/types";

export type ConfigData = {
  contas: AccountRow[];
  categorias: CategoryRow[];
  subcategorias: SubcategoryRow[];
  templates: TemplateRow[];
  metricasNoetrix: NoetrixMetricRow[];
};

export async function carregarConfiguracoes(): Promise<ConfigData> {
  const db = financasDb();
  const [contas, categorias, subcategorias, templates, metricasNoetrix] = await Promise.all([
    db.from("fin_accounts").select("*").order("name"),
    db.from("fin_categories").select("*").order("name"),
    db.from("fin_subcategories").select("*").order("name"),
    db.from("fin_recurring_templates").select("*").order("description"),
    db.from("fin_noetrix_metrics").select("*").order("mes", { ascending: false }).limit(12),
  ]);
  for (const r of [contas, categorias, subcategorias, templates, metricasNoetrix]) {
    if (r.error) throw new Error(r.error.message);
  }
  return {
    contas: (contas.data ?? []) as AccountRow[],
    categorias: (categorias.data ?? []) as CategoryRow[],
    subcategorias: (subcategorias.data ?? []) as SubcategoryRow[],
    templates: (templates.data ?? []) as TemplateRow[],
    metricasNoetrix: (metricasNoetrix.data ?? []) as NoetrixMetricRow[],
  };
}
