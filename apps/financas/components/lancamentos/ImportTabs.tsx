"use client";

import { useState } from "react";
import { FilaRevisao } from "@/components/lancamentos/FilaRevisao";
import type { AccountRow, CategoryRow, SubcategoryRow } from "@/lib/financas/types";

type Aba = "ofx" | "excel";

export function ImportTabs({
  contas,
  categorias,
  subcategorias,
}: {
  contas: AccountRow[];
  categorias: CategoryRow[];
  subcategorias: SubcategoryRow[];
}) {
  const [aba, setAba] = useState<Aba>("ofx");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 border-b">
        <button
          type="button"
          onClick={() => setAba("ofx")}
          aria-label="Aba de importação OFX"
          aria-current={aba === "ofx"}
          className={`px-3 py-2 text-sm border-b-2 ${
            aba === "ofx" ? "border-black font-semibold" : "border-transparent text-gray-500"
          }`}
        >
          OFX
        </button>
        <button
          type="button"
          disabled
          aria-label="Aba de importação Excel, indisponível"
          className="px-3 py-2 text-sm border-b-2 border-transparent text-gray-400 flex items-center gap-2 cursor-not-allowed"
        >
          Excel
          <span className="text-xs border px-1.5 py-0.5 text-gray-400">Em breve</span>
        </button>
      </div>

      {aba === "ofx" ? (
        <FilaRevisao contas={contas} categorias={categorias} subcategorias={subcategorias} />
      ) : (
        <p className="text-sm text-gray-500">
          Importação de parcelas futuras por planilha Excel — em breve.
        </p>
      )}
    </div>
  );
}
