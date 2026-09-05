"use client";

import { useActionState } from "react";
import { salvarMetricaNoetrix, type Resultado } from "@/app/configuracoes/actions";

const INICIAL: Resultado = { ok: true };

export function NovaMetricaForm({ mesAtual }: { mesAtual: string }) {
  const [estado, acao, pendente] = useActionState(
    (_prev: Resultado, fd: FormData) => salvarMetricaNoetrix(fd),
    INICIAL,
  );

  return (
    <form action={acao} className="flex flex-col gap-2 border p-4">
      <input
        type="month"
        name="mes"
        defaultValue={mesAtual}
        aria-label="Mês da métrica"
        required
        className="border px-4 py-3"
      />
      <input
        name="mrr"
        inputMode="decimal"
        placeholder="MRR"
        aria-label="MRR do mês"
        required
        className="border px-4 py-3"
      />
      <input
        type="number"
        name="clientes_pagantes"
        min={0}
        placeholder="Clientes pagantes"
        aria-label="Clientes pagantes do mês"
        required
        className="border px-4 py-3"
      />
      <input
        name="churn_pct"
        inputMode="decimal"
        placeholder="Churn % (opcional)"
        aria-label="Churn percentual do mês"
        className="border px-4 py-3"
      />
      <input
        name="reserva_meses"
        inputMode="decimal"
        placeholder="Reserva em meses (opcional)"
        aria-label="Reserva em meses do mês"
        className="border px-4 py-3"
      />

      {!estado.ok && (
        <p role="alert" className="text-sm text-red-700">
          {estado.erro}
        </p>
      )}

      <button type="submit" disabled={pendente} className="border px-4 py-3">
        {pendente ? "Salvando…" : "Salvar métrica"}
      </button>
    </form>
  );
}
