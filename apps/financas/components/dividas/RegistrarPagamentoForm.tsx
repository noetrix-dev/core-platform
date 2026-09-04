"use client";

import { useActionState } from "react";
import { registrarPagamentoDivida, type Resultado } from "@/app/dividas/actions";
import { hojeISO } from "@/lib/datas";
import type { AccountRow } from "@/lib/financas/types";

const INICIAL: Resultado = { ok: true };

export function RegistrarPagamentoForm({
  debtId,
  contas,
  valorSugerido,
}: {
  debtId: string;
  contas: AccountRow[];
  valorSugerido: number | null;
}) {
  const [estado, acao, pendente] = useActionState(
    (_prev: Resultado, fd: FormData) => registrarPagamentoDivida(fd),
    INICIAL,
  );

  return (
    <form action={acao} className="flex flex-col gap-2 mt-2">
      <input type="hidden" name="debt_id" value={debtId} />
      <input
        name="amount"
        inputMode="decimal"
        placeholder="Valor do pagamento"
        aria-label="Valor do pagamento"
        defaultValue={valorSugerido != null ? String(valorSugerido) : ""}
        required
        className="border px-4 py-3"
      />
      <select name="account_id" aria-label="Conta usada no pagamento" className="border px-4 py-3">
        <option value="">Sem conta</option>
        {contas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        name="due_date"
        defaultValue={hojeISO()}
        aria-label="Data do pagamento"
        required
        className="border px-4 py-3"
      />
      <select name="status" aria-label="Status do pagamento" className="border px-4 py-3">
        <option value="paid">Pago</option>
        <option value="pending">Pendente</option>
      </select>

      {!estado.ok && (
        <p role="alert" className="text-sm text-red-700">
          {estado.erro}
        </p>
      )}

      <button type="submit" disabled={pendente} className="border px-4 py-3">
        {pendente ? "Registrando…" : "Registrar pagamento"}
      </button>
    </form>
  );
}
