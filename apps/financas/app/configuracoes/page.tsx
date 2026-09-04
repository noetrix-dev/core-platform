import { requireUser } from "@/lib/supabase/auth";
import { carregarConfiguracoes } from "@/lib/configuracoes/load";
import { SecaoContas } from "@/components/configuracoes/SecaoContas";
import { SecaoCategorias } from "@/components/configuracoes/SecaoCategorias";
import { SecaoRecorrentes } from "@/components/configuracoes/SecaoRecorrentes";
import { SecaoNoetrix } from "@/components/configuracoes/SecaoNoetrix";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configurações — Finanças" };

export default async function ConfiguracoesPage() {
  await requireUser();
  const data = await carregarConfiguracoes();

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 flex flex-col gap-10">
      <h1 className="text-xl font-bold">Configurações</h1>
      <SecaoContas contas={data.contas} />
      <SecaoCategorias
        categorias={data.categorias}
        subcategorias={data.subcategorias}
      />
      <SecaoRecorrentes
        templates={data.templates}
        categorias={data.categorias}
        subcategorias={data.subcategorias}
        contas={data.contas}
      />
      <SecaoNoetrix metricas={data.metricasNoetrix} />
    </main>
  );
}
