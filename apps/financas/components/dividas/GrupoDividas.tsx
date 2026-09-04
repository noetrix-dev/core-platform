import type { AccountRow, DebtRow, Grupo } from "@/lib/financas/types";
import type { LinhaAgregada } from "@/lib/dividas/progresso";
import { progressoDivida } from "@/lib/dividas/progresso";
import { editarDivida } from "@/app/dividas/actions";
import { RegistrarPagamentoForm } from "@/components/dividas/RegistrarPagamentoForm";

const GRUPO_OPCOES: { valor: Grupo; rotulo: string }[] = [
  { valor: "fgts", rotulo: "FGTS" },
  { valor: "consignado", rotulo: "Consignado" },
  { valor: "serasa", rotulo: "Serasa" },
  { valor: "pessoal", rotulo: "Pessoal / rotativo" },
  { valor: "familia", rotulo: "Família" },
  { valor: "cartao", rotulo: "Cartões" },
];

const statusLabel: Record<DebtRow["status"], string> = {
  ativa: "Ativa",
  quitada: "Quitada",
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function GrupoDividas({
  rotulo,
  linha,
  dividas,
  contas,
}: {
  rotulo: string;
  linha: LinhaAgregada;
  dividas: DebtRow[];
  contas: AccountRow[];
}) {
  if (dividas.length === 0) return null;

  return (
    <section className="border px-4 py-3 flex flex-col gap-3">
      <div>
        <p className="font-semibold">{rotulo}</p>
        <p className="text-sm text-gray-500">
          Restante {brl(linha.restante)} de {brl(linha.total)} ({Math.round(linha.progresso * 100)}%
          quitado)
        </p>
        <div className="h-2 bg-gray-100">
          <div className="h-2 bg-gray-500" style={{ width: `${linha.progresso * 100}%` }} />
        </div>
      </div>

      <ul className="flex flex-col gap-4">
        {dividas.map((d) => {
          const pct = progressoDivida(d) * 100;
          return (
            <li key={d.id} className="border-t pt-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{d.creditor}</p>
                <span className="text-xs border px-2 py-1 shrink-0">{statusLabel[d.status]}</span>
              </div>
              <p className="text-sm text-gray-500">
                {brl(d.remaining_amount)} de {brl(d.total_amount)}
                {d.monthly_payment != null && <> · parcela {brl(d.monthly_payment)}</>}
                {d.due_day != null && <> · vence dia {d.due_day}</>}
              </p>
              <div className="h-2 bg-gray-100">
                <div className="h-2 bg-gray-500" style={{ width: `${pct}%` }} />
              </div>

              <details>
                <summary className="cursor-pointer text-sm">Registrar pagamento</summary>
                <RegistrarPagamentoForm
                  debtId={d.id}
                  contas={contas}
                  valorSugerido={d.monthly_payment}
                />
              </details>

              <details>
                <summary className="cursor-pointer text-sm">Editar</summary>
                <form
                  action={async (fd) => {
                    "use server";
                    await editarDivida(fd);
                  }}
                  className="flex flex-col gap-2 mt-2"
                >
                  <input type="hidden" name="id" value={d.id} />
                  <input
                    name="creditor"
                    defaultValue={d.creditor}
                    aria-label={`Credor de ${d.creditor}`}
                    required
                    className="border px-4 py-3"
                  />
                  <select
                    name="grupo"
                    defaultValue={d.grupo}
                    aria-label={`Grupo de ${d.creditor}`}
                    required
                    className="border px-4 py-3"
                  >
                    {GRUPO_OPCOES.map((g) => (
                      <option key={g.valor} value={g.valor}>
                        {g.rotulo}
                      </option>
                    ))}
                  </select>
                  <input
                    name="total_amount"
                    inputMode="decimal"
                    defaultValue={String(d.total_amount)}
                    aria-label={`Valor total de ${d.creditor}`}
                    required
                    className="border px-4 py-3"
                  />
                  <input
                    name="remaining_amount"
                    inputMode="decimal"
                    defaultValue={String(d.remaining_amount)}
                    aria-label={`Valor restante de ${d.creditor}`}
                    required
                    className="border px-4 py-3"
                  />
                  <input
                    name="monthly_payment"
                    inputMode="decimal"
                    defaultValue={d.monthly_payment != null ? String(d.monthly_payment) : ""}
                    placeholder="Parcela mensal (opcional)"
                    aria-label={`Parcela mensal de ${d.creditor}`}
                    className="border px-4 py-3"
                  />
                  <input
                    type="number"
                    name="due_day"
                    min={1}
                    max={31}
                    defaultValue={d.due_day != null ? String(d.due_day) : ""}
                    placeholder="Dia de vencimento (opcional)"
                    aria-label={`Dia de vencimento de ${d.creditor}`}
                    className="border px-4 py-3"
                  />
                  <select
                    name="status"
                    defaultValue={d.status}
                    aria-label={`Status de ${d.creditor}`}
                    className="border px-4 py-3"
                  >
                    <option value="ativa">Ativa</option>
                    <option value="quitada">Quitada</option>
                  </select>
                  <button type="submit" className="border px-4 py-3">
                    Salvar
                  </button>
                </form>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
