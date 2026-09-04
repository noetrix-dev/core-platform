import { requireUser } from "@/lib/supabase/auth";
import { financasDb } from "@/lib/supabase/server";
import { ImportTabs } from "@/components/lancamentos/ImportTabs";
import type { AccountRow, CategoryRow, SubcategoryRow } from "@/lib/financas/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importar OFX — Finanças" };

export default async function ImportarPage() {
  await requireUser();
  const db = financasDb();
  const [contas, categorias, subcategorias] = await Promise.all([
    db.from("fin_accounts").select("*").eq("ativo", true).order("name"),
    db.from("fin_categories").select("*").eq("ativo", true).order("name"),
    db.from("fin_subcategories").select("*").eq("ativo", true).order("name"),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 flex flex-col gap-6">
      <h1 className="text-xl font-bold">Importar extrato</h1>
      <ImportTabs
        contas={(contas.data ?? []) as AccountRow[]}
        categorias={(categorias.data ?? []) as CategoryRow[]}
        subcategorias={(subcategorias.data ?? []) as SubcategoryRow[]}
      />
    </main>
  );
}
