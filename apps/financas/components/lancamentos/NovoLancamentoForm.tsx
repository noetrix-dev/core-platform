"use client";

import { useActionState, useState } from "react";
import { criarLancamento, type Resultado } from "@/app/lancamentos/actions";
import type { AccountRow, CategoryRow, SubcategoryRow } from "@/lib/financas/types";

const INICIAL: Resultado = { ok: true };

export function NovoLancamentoForm({
  contas,
  categorias,
  subcategorias,
  mes,
}: {
  contas: AccountRow[];
  categorias: CategoryRow[];
  subcategorias: SubcategoryRow[];
  mes: string;
}) {
  const [estado, acao, pendente] = useActionState(
    (_prev: Resultado, fd: FormData) => criarLancamento(fd),
    INICIAL,
  );
  const [tipo, setTipo] = useState("variable");
  const [categoriaId, setCategoriaId] = useState("");

  const subcategoriasFiltradas = categoriaId
    ? subcategorias.filter((s) => s.category_id === categoriaId)
    : subcategorias;

  return (
    <form action={acao} className="flex flex-col gap-2 border p-4">
      <h2 className="text-sm font-semibold">Novo lançamento</h2>

      <input
        name="description"
        placeholder="Descrição"
        aria-label="Descrição do lançamento"
        required
        className="border px-4 py-3"
      />
      <input
        name="amount"
        inputMode="decimal"
        placeholder="Valor"
        aria-label="Valor do lançamento"
        required
        className="border px-4 py-3"
      />
      <select name="movement" aria-label="Movimento do lançamento" required className="border px-4 py-3">
        <option value="">Selecione o movimento</option>
        <option value="income">Receita</option>
        <option value="expense">Despesa</option>
        <option value="investment">Investimento</option>
      </select>
      <select
        name="type"
        value={tipo}
        onChange={(e) => setTipo(e.target.value)}
        aria-label="Tipo do lançamento"
        className="border px-4 py-3"
      >
        <option value="variable">Variável</option>
        <option value="fixed">Fixo</option>
        <option value="installment">Parcelado</option>
      </select>

      {tipo === "installment" && (
        <input
          type="number"
          name="parcelas"
          min={1}
          placeholder="Número de parcelas"
          aria-label="Número de parcelas"
          required
          className="border px-4 py-3"
        />
      )}

      <input
        type="date"
        name="due_date"
        defaultValue={`${mes}-01`}
        aria-label="Vencimento do lançamento"
        required
        className="border px-4 py-3"
      />

      <select name="account_id" aria-label="Conta do lançamento" className="border px-4 py-3">
        <option value="">Sem conta</option>
        {contas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select
        name="category_id"
        value={categoriaId}
        onChange={(e) => setCategoriaId(e.target.value)}
        aria-label="Categoria do lançamento"
        className="border px-4 py-3"
      >
        <option value="">Sem categoria</option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select name="subcategory_id" aria-label="Subcategoria do lançamento" className="border px-4 py-3">
        <option value="">Sem subcategoria</option>
        {subcategoriasFiltradas.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {tipo !== "installment" && (
        <select name="status" aria-label="Status do lançamento" className="border px-4 py-3">
          <option value="pending">Pendente</option>
          <option value="paid">Pago</option>
        </select>
      )}

      {!estado.ok && (
        <p role="alert" className="text-sm text-red-700">
          {estado.erro}
        </p>
      )}

      <button type="submit" disabled={pendente} className="border px-4 py-3">
        {pendente ? "Salvando…" : "Adicionar lançamento"}
      </button>
    </form>
  );
}
