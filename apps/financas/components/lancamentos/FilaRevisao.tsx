"use client";

import { useState } from "react";
import {
  analisarOfx,
  confirmarImportacao,
  type CandidatoRevisao,
  type Resultado,
} from "@/app/lancamentos/importar/actions";
import type { AccountRow, CategoryRow, SubcategoryRow } from "@/lib/financas/types";

type Fase = "upload" | "revisao" | "concluido";

type Atrib = {
  movement: "income" | "expense";
  category_id: string | null;
  subcategory_id: string | null;
  incluir: boolean;
  memo: string;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function FilaRevisao({
  contas,
  categorias,
  subcategorias,
}: {
  contas: AccountRow[];
  categorias: CategoryRow[];
  subcategorias: SubcategoryRow[];
}) {
  const [fase, setFase] = useState<Fase>("upload");
  const [accountId, setAccountId] = useState("");
  const [candidatos, setCandidatos] = useState<CandidatoRevisao[]>([]);
  const [atribs, setAtribs] = useState<Record<string, Atrib>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  function atualizarAtrib(externalId: string, patch: Partial<Atrib>) {
    setAtribs((prev) => ({ ...prev, [externalId]: { ...prev[externalId], ...patch } }));
  }

  async function handleAnalisar(fd: FormData) {
    setErro(null);
    setEnviando(true);
    try {
      const res = await analisarOfx(fd);
      if (!res.ok) {
        setErro(res.erro);
        return;
      }
      const novosAtribs: Record<string, Atrib> = {};
      for (const c of res.candidatos) {
        novosAtribs[c.externalId] = {
          movement: c.movimentoSugerido,
          category_id: null,
          subcategory_id: null,
          incluir: c.novo,
          memo: c.memo,
        };
      }
      setAccountId(res.accountId);
      setCandidatos(res.candidatos);
      setAtribs(novosAtribs);
      setFase("revisao");
    } finally {
      setEnviando(false);
    }
  }

  async function handleConfirmar() {
    setErro(null);
    setConfirmando(true);
    try {
      const linhas = candidatos
        .filter((c) => atribs[c.externalId]?.incluir)
        .map((c) => ({
          externalId: c.externalId,
          dataIso: c.dataIso,
          valor: c.valor,
          memo: atribs[c.externalId].memo,
          movement: atribs[c.externalId].movement,
          category_id: atribs[c.externalId].category_id,
          subcategory_id: atribs[c.externalId].subcategory_id,
        }));
      if (!linhas.length) {
        setErro("Selecione ao menos um lançamento para importar.");
        return;
      }
      const fd = new FormData();
      fd.set("account_id", accountId);
      fd.set("linhas", JSON.stringify(linhas));
      const res = await confirmarImportacao(fd);
      if (!res.ok) {
        setErro(res.erro);
        return;
      }
      setResultado(res);
      setFase("concluido");
    } finally {
      setConfirmando(false);
    }
  }

  if (fase === "concluido" && resultado?.ok) {
    return (
      <section className="flex flex-col gap-3 border p-4">
        <h2 className="text-sm font-semibold">Importação concluída</h2>
        <p className="text-sm">
          {resultado.criados} lançamento(s) criado(s), {resultado.ignorados} ignorado(s).
        </p>
        <a href="/lancamentos" className="text-sm underline">
          Voltar para lançamentos
        </a>
      </section>
    );
  }

  if (fase === "revisao") {
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold">Revisar transações do extrato</h2>

        {erro && (
          <p role="alert" className="text-sm text-red-700">
            {erro}
          </p>
        )}

        <ul className="flex flex-col divide-y border">
          {candidatos.map((c) => {
            const atrib = atribs[c.externalId];
            if (!atrib) return null;
            const subcategoriasFiltradas = atrib.category_id
              ? subcategorias.filter((s) => s.category_id === atrib.category_id)
              : subcategorias;

            if (!c.novo) {
              return (
                <li key={c.externalId} className="p-3 opacity-50 flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={false}
                      disabled
                      aria-label={`${c.memo} já importado, não selecionável`}
                    />
                    <p className="text-sm">
                      {c.dataIso} · {brl(c.valor)} · {c.memo}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500">Já importado anteriormente</p>
                </li>
              );
            }

            return (
              <li key={c.externalId} className="p-2 flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={atrib.incluir}
                    onChange={(e) => atualizarAtrib(c.externalId, { incluir: e.target.checked })}
                    aria-label={`Incluir ${c.memo || "lançamento"} na importação`}
                  />
                  <span className="text-gray-500 shrink-0">{c.dataIso}</span>
                  <span className="font-medium shrink-0">{brl(c.valor)}</span>
                </div>

                <div className="flex gap-1 overflow-x-auto">
                  <input
                    value={atrib.memo}
                    onChange={(e) => atualizarAtrib(c.externalId, { memo: e.target.value })}
                    aria-label="Descrição do lançamento"
                    className="border px-2 py-1 text-sm w-36 shrink-0"
                  />

                  <select
                    value={atrib.movement}
                    onChange={(e) =>
                      atualizarAtrib(c.externalId, { movement: e.target.value as "income" | "expense" })
                    }
                    aria-label="Movimento do lançamento"
                    className="border px-1 py-1 text-sm shrink-0"
                  >
                    <option value="income">Receita</option>
                    <option value="expense">Despesa</option>
                  </select>

                  <select
                    value={atrib.category_id ?? ""}
                    onChange={(e) =>
                      atualizarAtrib(c.externalId, {
                        category_id: e.target.value || null,
                        subcategory_id: null,
                      })
                    }
                    aria-label="Categoria do lançamento"
                    className="border px-1 py-1 text-sm w-28 shrink-0"
                  >
                    <option value="">Sem categoria</option>
                    {categorias.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={atrib.subcategory_id ?? ""}
                    onChange={(e) =>
                      atualizarAtrib(c.externalId, { subcategory_id: e.target.value || null })
                    }
                    aria-label="Subcategoria do lançamento"
                    className="border px-1 py-1 text-sm w-28 shrink-0"
                  >
                    <option value="">Sem subcategoria</option>
                    {subcategoriasFiltradas.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={handleConfirmar}
          disabled={confirmando}
          className="border px-4 py-3"
        >
          {confirmando ? "Importando…" : "Confirmar importação"}
        </button>
      </section>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleAnalisar(new FormData(e.currentTarget));
      }}
      className="flex flex-col gap-2 border p-4"
    >
      <h2 className="text-sm font-semibold">Enviar extrato .ofx</h2>

      <select name="account_id" required aria-label="Conta do extrato" className="border px-4 py-3">
        <option value="">Selecione a conta</option>
        {contas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <input
        type="file"
        name="arquivo"
        accept=".ofx"
        required
        aria-label="Arquivo do extrato OFX"
        className="border px-4 py-3"
      />

      {erro && (
        <p role="alert" className="text-sm text-red-700">
          {erro}
        </p>
      )}

      <button type="submit" disabled={enviando} className="border px-4 py-3">
        {enviando ? "Analisando…" : "Analisar arquivo"}
      </button>
    </form>
  );
}
