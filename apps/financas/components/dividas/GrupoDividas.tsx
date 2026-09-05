import type { AccountRow, DebtRow } from "@/lib/financas/types";
import type { LinhaAgregada } from "@/lib/dividas/progresso";
import { progressoDivida } from "@/lib/dividas/progresso";
import { RegistrarPagamentoForm } from "@/components/dividas/RegistrarPagamentoForm";
import { EditarDividaForm } from "@/components/dividas/EditarDividaForm";

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
                <EditarDividaForm divida={d} />
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
