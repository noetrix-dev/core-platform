import { requireUser } from "@/lib/supabase/auth";
import { carregarLancamentos } from "@/lib/lancamentos/load";
import { Filtros } from "@/components/lancamentos/Filtros";
import { NovoLancamentoForm } from "@/components/lancamentos/NovoLancamentoForm";
import { LinhaLancamento } from "@/components/lancamentos/LinhaLancamento";
import { gerarMes, recalcularAtrasados } from "./actions";
import { hojeISO } from "@/lib/datas";
import type { TxStatus } from "@/lib/financas/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lançamentos — Finanças" };

export default async function LancamentosPage({
  searchParams,
}: PageProps<"/lancamentos">) {
  await requireUser();
  const sp = await searchParams;
  const mes = (sp.mes as string) || hojeISO().slice(0, 7);
  const data = await carregarLancamentos({
    mes,
    status: sp.status as TxStatus | undefined,
    contaId: sp.conta as string | undefined,
    categoriaId: sp.categoria as string | undefined,
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Lançamentos</h1>
        <form
          action={async (fd) => {
            "use server";
            await gerarMes(fd);
          }}
        >
          <input type="hidden" name="mes" value={mes} />
          <button className="border px-3 py-1 text-sm">Gerar mês</button>
        </form>
      </header>

      <Filtros
        mes={mes}
        contas={data.contas}
        categorias={data.categorias}
        atual={{ status: sp.status as string, conta: sp.conta as string, categoria: sp.categoria as string }}
      />

      <section className="grid grid-cols-3 gap-2 text-sm">
        <div>Entradas: {data.totais.entradas.toFixed(2)}</div>
        <div>Saídas: {data.totais.saidas.toFixed(2)}</div>
        <div>Em aberto: {data.totais.pendentes.toFixed(2)}</div>
      </section>

      <form
        action={async () => {
          "use server";
          await recalcularAtrasados();
        }}
      >
        <button className="text-sm underline">Recalcular atrasados</button>
      </form>

      <NovoLancamentoForm
        contas={data.contas}
        categorias={data.categorias}
        subcategorias={data.subcategorias}
        mes={mes}
      />

      <ul className="flex flex-col divide-y">
        {data.linhas.map((l) => (
          <LinhaLancamento
            key={l.id}
            linha={l}
            contas={data.contas}
            categorias={data.categorias}
            subcategorias={data.subcategorias}
          />
        ))}
      </ul>
    </main>
  );
}
