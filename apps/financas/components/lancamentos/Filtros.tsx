"use client";

import type { FormEvent } from "react";
import type { AccountRow, CategoryRow } from "@/lib/financas/types";

export function Filtros({
  mes,
  contas,
  categorias,
  atual,
}: {
  mes: string;
  contas: AccountRow[];
  categorias: CategoryRow[];
  atual: { status?: string; conta?: string; categoria?: string };
}) {
  const submitOnChange = (e: FormEvent<HTMLSelectElement | HTMLInputElement>) => {
    e.currentTarget.form?.requestSubmit();
  };

  return (
    <form method="get" className="flex flex-wrap gap-2 items-end">
      <div className="flex flex-col gap-1">
        <label htmlFor="mes" className="text-sm">
          Mês
        </label>
        <input
          id="mes"
          name="mes"
          type="month"
          defaultValue={mes}
          onChange={submitOnChange}
          aria-label="Filtrar por mês"
          className="border px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="status" className="text-sm">
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={atual.status ?? ""}
          onChange={submitOnChange}
          aria-label="Filtrar por status"
          className="border px-3 py-2"
        >
          <option value="">Todos</option>
          <option value="pending">Pendente</option>
          <option value="paid">Pago</option>
          <option value="overdue">Atrasado</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="conta" className="text-sm">
          Conta
        </label>
        <select
          id="conta"
          name="conta"
          defaultValue={atual.conta ?? ""}
          onChange={submitOnChange}
          aria-label="Filtrar por conta"
          className="border px-3 py-2"
        >
          <option value="">Todas</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="categoria" className="text-sm">
          Categoria
        </label>
        <select
          id="categoria"
          name="categoria"
          defaultValue={atual.categoria ?? ""}
          onChange={submitOnChange}
          aria-label="Filtrar por categoria"
          className="border px-3 py-2"
        >
          <option value="">Todas</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" className="border px-3 py-2 text-sm">
        Filtrar
      </button>
    </form>
  );
}
