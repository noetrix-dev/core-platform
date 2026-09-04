import type { CategoryRow, SubcategoryRow } from "@/lib/financas/types";
import {
  criarCategoria,
  editarCategoria,
  criarSubcategoria,
  toggleSubcategoria,
} from "@/app/configuracoes/actions";

const tipoLabel: Record<CategoryRow["type"], string> = {
  income: "Receita",
  expense: "Despesa",
  investment: "Investimento",
};

const bucketLabel: Record<NonNullable<CategoryRow["bucket"]>, string> = {
  necessidade: "Necessidade",
  desejo: "Desejo",
  investimento: "Investimento",
};

export function SecaoCategorias({
  categorias,
  subcategorias,
}: {
  categorias: CategoryRow[];
  subcategorias: SubcategoryRow[];
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Categorias</h2>

      <form
        action={async (fd) => {
          "use server";
          await criarCategoria(fd);
        }}
        className="flex flex-col gap-2 border p-4"
      >
        <input
          name="name"
          placeholder="Nova categoria"
          aria-label="Nome da nova categoria"
          required
          className="border px-4 py-3"
        />
        <select name="type" aria-label="Tipo da nova categoria" required className="border px-4 py-3">
          <option value="">Selecione o tipo</option>
          <option value="income">Receita</option>
          <option value="expense">Despesa</option>
          <option value="investment">Investimento</option>
        </select>
        <select name="bucket" aria-label="Bucket da nova categoria" className="border px-4 py-3">
          <option value="">Sem bucket</option>
          <option value="necessidade">Necessidade</option>
          <option value="desejo">Desejo</option>
          <option value="investimento">Investimento</option>
        </select>
        <button type="submit" className="border px-4 py-3">
          Adicionar categoria
        </button>
      </form>

      {categorias.length === 0 && <p>Nenhuma categoria cadastrada.</p>}

      <ul className="flex flex-col gap-3">
        {categorias.map((categoria) => {
          const subs = subcategorias.filter((s) => s.category_id === categoria.id);
          return (
            <li
              key={categoria.id}
              className="border p-4"
              data-inativo={categoria.ativo ? undefined : "true"}
            >
              <p className="font-medium">
                {categoria.name}
                {!categoria.ativo && " (inativa)"}
              </p>
              <p className="text-sm text-gray-500">
                {tipoLabel[categoria.type]}
                {categoria.bucket ? ` · ${bucketLabel[categoria.bucket]}` : ""}
              </p>

              <details className="mt-2">
                <summary className="cursor-pointer">Editar</summary>
                <form
                  action={async (fd) => {
                    "use server";
                    await editarCategoria(fd);
                  }}
                  className="flex flex-col gap-2 mt-2"
                >
                  <input type="hidden" name="id" value={categoria.id} />
                  <input
                    name="name"
                    defaultValue={categoria.name}
                    aria-label={`Nome de ${categoria.name}`}
                    required
                    className="border px-4 py-3"
                  />
                  <select
                    name="type"
                    defaultValue={categoria.type}
                    aria-label={`Tipo de ${categoria.name}`}
                    required
                    className="border px-4 py-3"
                  >
                    <option value="income">Receita</option>
                    <option value="expense">Despesa</option>
                    <option value="investment">Investimento</option>
                  </select>
                  <select
                    name="bucket"
                    defaultValue={categoria.bucket ?? ""}
                    disabled={categoria.type === "income"}
                    aria-label={`Bucket de ${categoria.name}`}
                    className="border px-4 py-3"
                  >
                    <option value="">Sem bucket</option>
                    <option value="necessidade">Necessidade</option>
                    <option value="desejo">Desejo</option>
                    <option value="investimento">Investimento</option>
                  </select>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="ativo"
                      value="true"
                      defaultChecked={categoria.ativo}
                    />
                    Categoria ativa
                  </label>
                  <button type="submit" className="border px-4 py-3">
                    Salvar
                  </button>
                </form>
              </details>

              <details className="mt-2">
                <summary className="cursor-pointer">Subcategorias ({subs.length})</summary>
                <ul className="flex flex-col gap-2 mt-2 pl-4">
                  {subs.length === 0 && <li className="text-sm text-gray-500">Nenhuma subcategoria.</li>}
                  {subs.map((sub) => (
                    <li key={sub.id} className="flex items-center justify-between gap-2">
                      <span>
                        {sub.name}
                        {!sub.ativo && " (inativa)"}
                      </span>
                      <form
                        action={async (fd) => {
                          "use server";
                          await toggleSubcategoria(fd);
                        }}
                      >
                        <input type="hidden" name="id" value={sub.id} />
                        <input type="hidden" name="ativo" value={String(!sub.ativo)} />
                        <button
                          type="submit"
                          className="border px-3 py-1"
                          aria-label={`${sub.ativo ? "Desativar" : "Ativar"} ${sub.name}`}
                        >
                          {sub.ativo ? "Desativar" : "Ativar"}
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
                <form
                  action={async (fd) => {
                    "use server";
                    await criarSubcategoria(fd);
                  }}
                  className="flex gap-2 mt-2"
                >
                  <input type="hidden" name="category_id" value={categoria.id} />
                  <input
                    name="name"
                    placeholder="Nova subcategoria"
                    aria-label={`Nova subcategoria de ${categoria.name}`}
                    required
                    className="border px-4 py-3"
                  />
                  <button type="submit" className="border px-4 py-3">
                    Adicionar
                  </button>
                </form>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
