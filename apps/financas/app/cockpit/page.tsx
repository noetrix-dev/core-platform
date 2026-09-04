import { requireUser } from "@/lib/supabase/auth";
import { carregarCockpit } from "@/lib/cockpit/load";
import { SeletorMes } from "@/components/cockpit/SeletorMes";
import { KpisCockpit } from "@/components/cockpit/KpisCockpit";
import { RoscaCategoria } from "@/components/cockpit/RoscaCategoria";
import { RoscaDistribuicao } from "@/components/cockpit/RoscaDistribuicao";
import { PainelSplit } from "@/components/cockpit/PainelSplit";
import { ProximasContas } from "@/components/cockpit/ProximasContas";
import { BlocoNoetrix } from "@/components/cockpit/BlocoNoetrix";
import { BlocoCartoes } from "@/components/cockpit/BlocoCartoes";
import { UltimosLancamentos } from "@/components/cockpit/UltimosLancamentos";
import { CardsSaldo } from "@/components/cockpit/CardsSaldo";
import { hojeISO } from "@/lib/datas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cockpit — Finanças" };

export default async function CockpitPage({
  searchParams,
}: PageProps<"/cockpit">) {
  await requireUser();
  const sp = await searchParams;
  const mes = (sp.mes as string) || hojeISO().slice(0, 7);
  const d = await carregarCockpit(mes);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 flex flex-col gap-6">
      <SeletorMes mes={d.mes} />
      {d.alertaNegativo && d.projecao && (
        <div role="alert" className="border border-red-600 bg-red-50 px-4 py-3 text-red-800">
          Saldo projetado para o fim do mês: R$ {d.projecao.projetado.toFixed(2)}
        </div>
      )}
      <KpisCockpit kpis={d.kpis} />
      <RoscaCategoria linhas={d.categorias} />
      <RoscaDistribuicao linhas={d.distribuicao} />
      <PainelSplit split={d.split} />
      <ProximasContas linhas={d.proximasContas} mesVigente={d.mesVigente} />
      <BlocoNoetrix noetrix={d.noetrix} gatilhos={d.gatilhos} />
      <BlocoCartoes cartoes={d.cartoes} />
      <CardsSaldo contas={d.contas} saldoTotal={d.saldoTotal} projecao={d.projecao} />
      <UltimosLancamentos linhas={d.ultimosLancamentos} />
      <section className="border px-4 py-3">
        <p className="font-semibold">Pague-se primeiro</p>
        <p className="text-sm">
          Meta de investimento no mês: R$ {d.metaInvestimento.toFixed(2)} · já investido: R$ {d.investidoNoMes.toFixed(2)}
        </p>
      </section>
    </main>
  );
}
