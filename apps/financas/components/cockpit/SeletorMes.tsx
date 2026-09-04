"use client";

import type { FormEvent } from "react";

export function SeletorMes({ mes }: { mes: string }) {
  const submitOnChange = (e: FormEvent<HTMLInputElement>) => {
    e.currentTarget.form?.requestSubmit();
  };

  return (
    <form method="get" className="flex items-end gap-2">
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
          aria-label="Selecionar mês do cockpit"
          className="border px-3 py-2"
        />
      </div>
      <button type="submit" className="border px-3 py-2 text-sm">
        Ir
      </button>
    </form>
  );
}
