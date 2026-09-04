import type {
  AccountRow,
  CategoryRow,
  Movement,
  SubcategoryRow,
  TemplateRow,
  TxType,
} from "@/lib/financas/types";
import { criarTemplate, editarTemplate } from "@/app/configuracoes/actions";

const movementLabel: Record<Movement, string> = {
  income: "Receita",
  expense: "Despesa",
  investment: "Investimento",
};

const typeLabel: Record<TxType, string> = {
  fixed: "Fixo",
  variable: "Variável",
  installment: "Parcelado",
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function SecaoRecorrentes({
  templates,
  categorias,
  subcategorias,
  contas,
}: {
  templates: TemplateRow[];
  categorias: CategoryRow[];
  subcategorias: SubcategoryRow[];
  contas: AccountRow[];
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Lançamentos recorrentes</h2>

      <form
        action={async (fd) => {
          "use server";
          await criarTemplate(fd);
        }}
        className="flex flex-col gap-2 border p-4"
      >
        <input
          name="description"
          placeholder="Descrição"
          aria-label="Descrição do novo template"
          required
          className="border px-4 py-3"
        />
        <input
          name="amount"
          inputMode="decimal"
          placeholder="Valor"
          aria-label="Valor do novo template"
          required
          className="border px-4 py-3"
        />
        <select name="movement" aria-label="Movimento do novo template" required className="border px-4 py-3">
          <option value="">Selecione o movimento</option>
          <option value="income">Receita</option>
          <option value="expense">Despesa</option>
          <option value="investment">Investimento</option>
        </select>
        <input
          type="number"
          name="day_of_month"
          min={1}
          max={31}
          placeholder="Dia do mês"
          aria-label="Dia do mês do novo template"
          required
          className="border px-4 py-3"
        />
        <select name="type" aria-label="Tipo do novo template" className="border px-4 py-3">
          <option value="">Tipo (padrão fixo)</option>
          <option value="fixed">Fixo</option>
          <option value="variable">Variável</option>
          <option value="installment">Parcelado</option>
        </select>
        <select name="category_id" aria-label="Categoria do novo template" className="border px-4 py-3">
          <option value="">Sem categoria</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="subcategory_id"
          aria-label="Subcategoria do novo template"
          className="border px-4 py-3"
        >
          <option value="">Sem subcategoria</option>
          {subcategorias.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="account_id" aria-label="Conta do novo template" className="border px-4 py-3">
          <option value="">Sem conta</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit" className="border px-4 py-3">
          Adicionar template
        </button>
      </form>

      {templates.length === 0 && <p>Nenhum template cadastrado.</p>}

      <ul className="flex flex-col gap-3">
        {templates.map((t) => (
          <li key={t.id} className="border p-4" data-inativo={t.ativo ? undefined : "true"}>
            <p className="font-medium">
              {t.description}
              {!t.ativo && " (inativo)"}
            </p>
            <p className="text-sm text-gray-500">
              {brl(t.amount)} · {movementLabel[t.movement]} · dia {t.day_of_month} ·{" "}
              {typeLabel[t.type]}
            </p>

            <details className="mt-2">
              <summary className="cursor-pointer">Editar</summary>
              <form
                action={async (fd) => {
                  "use server";
                  await editarTemplate(fd);
                }}
                className="flex flex-col gap-2 mt-2"
              >
                <input type="hidden" name="id" value={t.id} />
                <input
                  name="description"
                  defaultValue={t.description}
                  aria-label={`Descrição de ${t.description}`}
                  required
                  className="border px-4 py-3"
                />
                <input
                  name="amount"
                  inputMode="decimal"
                  defaultValue={String(t.amount)}
                  aria-label={`Valor de ${t.description}`}
                  required
                  className="border px-4 py-3"
                />
                <select
                  name="movement"
                  defaultValue={t.movement}
                  aria-label={`Movimento de ${t.description}`}
                  required
                  className="border px-4 py-3"
                >
                  <option value="income">Receita</option>
                  <option value="expense">Despesa</option>
                  <option value="investment">Investimento</option>
                </select>
                <input
                  type="number"
                  name="day_of_month"
                  min={1}
                  max={31}
                  defaultValue={t.day_of_month}
                  aria-label={`Dia do mês de ${t.description}`}
                  required
                  className="border px-4 py-3"
                />
                <select
                  name="type"
                  defaultValue={t.type}
                  aria-label={`Tipo de ${t.description}`}
                  className="border px-4 py-3"
                >
                  <option value="fixed">Fixo</option>
                  <option value="variable">Variável</option>
                  <option value="installment">Parcelado</option>
                </select>
                <select
                  name="category_id"
                  defaultValue={t.category_id ?? ""}
                  aria-label={`Categoria de ${t.description}`}
                  className="border px-4 py-3"
                >
                  <option value="">Sem categoria</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  name="subcategory_id"
                  defaultValue={t.subcategory_id ?? ""}
                  aria-label={`Subcategoria de ${t.description}`}
                  className="border px-4 py-3"
                >
                  <option value="">Sem subcategoria</option>
                  {subcategorias.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <select
                  name="account_id"
                  defaultValue={t.account_id ?? ""}
                  aria-label={`Conta de ${t.description}`}
                  className="border px-4 py-3"
                >
                  <option value="">Sem conta</option>
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="ativo" value="true" defaultChecked={t.ativo} />
                  Template ativo
                </label>
                <button type="submit" className="border px-4 py-3">
                  Salvar
                </button>
              </form>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
