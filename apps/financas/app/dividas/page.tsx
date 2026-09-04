import { requireUser } from "@/lib/supabase/auth";
import { carregarDividas } from "@/lib/dividas/load";
import { criarDivida } from "@/app/dividas/actions";
import { GrupoDividas } from "@/components/dividas/GrupoDividas";
import type { Grupo } from "@/lib/financas/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dívidas — Finanças" };

const ORDEM: Grupo[] = ["fgts", "consignado", "serasa", "pessoal", "familia", "cartao"];
const ROTULO: Record<Grupo, string> = {
  fgts: "FGTS",
  consignado: "Consignado",
  serasa: "Serasa",
  pessoal: "Pessoal / rotativo",
  familia: "Família",
  cartao: "Cartões",
};

export default async function DividasPage() {
  await requireUser();
  const d = await carregarDividas();

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 flex flex-col gap-6">
      <h1 className="text-xl font-bold">Dívidas</h1>
      <section className="border px-4 py-3">
        <p className="font-semibold">Total do passivo</p>
        <p className="text-sm">
          Restante R$ {d.agregado.geral.restante.toFixed(2)} de R$ {d.agregado.geral.total.toFixed(2)}
          {" "}({Math.round(d.agregado.geral.progresso * 100)}% quitado)
        </p>
      </section>

      <details className="border px-4 py-3">
        <summary className="cursor-pointer font-semibold">Nova dívida</summary>
        <form
          action={async (fd) => {
            "use server";
            await criarDivida(fd);
          }}
          className="flex flex-col gap-2 mt-2"
        >
          <input
            name="creditor"
            placeholder="Credor"
            aria-label="Credor da nova dívida"
            required
            className="border px-4 py-3"
          />
          <select name="grupo" aria-label="Grupo da nova dívida" required className="border px-4 py-3">
            <option value="">Selecione o grupo</option>
            {ORDEM.map((g) => (
              <option key={g} value={g}>
                {ROTULO[g]}
              </option>
            ))}
          </select>
          <input
            name="total_amount"
            inputMode="decimal"
            placeholder="Valor total"
            aria-label="Valor total da nova dívida"
            required
            className="border px-4 py-3"
          />
          <input
            name="remaining_amount"
            inputMode="decimal"
            placeholder="Valor restante (opcional, padrão = total)"
            aria-label="Valor restante da nova dívida"
            className="border px-4 py-3"
          />
          <input
            name="monthly_payment"
            inputMode="decimal"
            placeholder="Parcela mensal (opcional)"
            aria-label="Parcela mensal da nova dívida"
            className="border px-4 py-3"
          />
          <input
            type="number"
            name="due_day"
            min={1}
            max={31}
            placeholder="Dia de vencimento (opcional)"
            aria-label="Dia de vencimento da nova dívida"
            className="border px-4 py-3"
          />
          <button type="submit" className="border px-4 py-3">
            Adicionar dívida
          </button>
        </form>
      </details>

      {ORDEM.map((g) => (
        <GrupoDividas
          key={g}
          rotulo={ROTULO[g]}
          linha={d.agregado.porGrupo[g]}
          dividas={d.dividas.filter((x) => x.grupo === g)}
          contas={d.contas}
        />
      ))}
    </main>
  );
}
