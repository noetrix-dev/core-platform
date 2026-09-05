"use client";

import { useActionState } from "react";
import { editarDivida, type Resultado } from "@/app/dividas/actions";
import type { DebtRow, Grupo } from "@/lib/financas/types";

const GRUPO_OPCOES: { valor: Grupo; rotulo: string }[] = [
  { valor: "fgts", rotulo: "FGTS" },
  { valor: "consignado", rotulo: "Consignado" },
  { valor: "serasa", rotulo: "Serasa" },
  { valor: "pessoal", rotulo: "Pessoal / rotativo" },
  { valor: "familia", rotulo: "Família" },
  { valor: "cartao", rotulo: "Cartões" },
];

const INICIAL: Resultado = { ok: true };

export function EditarDividaForm({ divida }: { divida: DebtRow }) {
  const [estado, acao, pendente] = useActionState(
    (_prev: Resultado, fd: FormData) => editarDivida(fd),
    INICIAL,
  );

  return (
    <form action={acao} className="flex flex-col gap-2 mt-2">
      <input type="hidden" name="id" value={divida.id} />
      <input
        name="creditor"
        defaultValue={divida.creditor}
        aria-label={`Credor de ${divida.creditor}`}
        required
        className="border px-4 py-3"
      />
      <select
        name="grupo"
        defaultValue={divida.grupo}
        aria-label={`Grupo de ${divida.creditor}`}
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
        defaultValue={String(divida.total_amount)}
        aria-label={`Valor total de ${divida.creditor}`}
        required
        className="border px-4 py-3"
      />
      <input
        name="remaining_amount"
        inputMode="decimal"
        defaultValue={String(divida.remaining_amount)}
        aria-label={`Valor restante de ${divida.creditor}`}
        required
        className="border px-4 py-3"
      />
      <input
        name="monthly_payment"
        inputMode="decimal"
        defaultValue={divida.monthly_payment != null ? String(divida.monthly_payment) : ""}
        placeholder="Parcela mensal (opcional)"
        aria-label={`Parcela mensal de ${divida.creditor}`}
        className="border px-4 py-3"
      />
      <input
        type="number"
        name="due_day"
        min={1}
        max={31}
        defaultValue={divida.due_day != null ? String(divida.due_day) : ""}
        placeholder="Dia de vencimento (opcional)"
        aria-label={`Dia de vencimento de ${divida.creditor}`}
        className="border px-4 py-3"
      />
      <select
        name="status"
        defaultValue={divida.status}
        aria-label={`Status de ${divida.creditor}`}
        className="border px-4 py-3"
      >
        <option value="ativa">Ativa</option>
        <option value="quitada">Quitada</option>
      </select>

      {!estado.ok && (
        <p role="alert" className="text-sm text-red-700">
          {estado.erro}
        </p>
      )}

      <button type="submit" disabled={pendente} className="border px-4 py-3">
        {pendente ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}
