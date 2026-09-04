import type { LinhaComStatus } from "@/lib/lancamentos/load";
import type { AccountRow, CategoryRow, SubcategoryRow } from "@/lib/financas/types";
import {
  mudarStatus,
  editarLancamento,
  excluirLancamento,
  excluirGrupoParcelas,
} from "@/app/lancamentos/actions";

const statusLabel: Record<LinhaComStatus["statusEfetivo"], string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Atrasado",
};

const movementLabel: Record<LinhaComStatus["movement"], string> = {
  income: "Receita",
  expense: "Despesa",
  investment: "Investimento",
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function LinhaLancamento({
  linha,
  contas,
  categorias,
  subcategorias,
}: {
  linha: LinhaComStatus;
  contas: AccountRow[];
  categorias: CategoryRow[];
  subcategorias: SubcategoryRow[];
}) {
  const pago = linha.status === "paid";
  const alvoToggle = pago ? "pending" : "paid";

  return (
    <li className="py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium">{linha.description}</p>
          <p className="text-sm text-gray-500">
            {brl(linha.amount)} · {movementLabel[linha.movement]} · vence {linha.due_date}
          </p>
        </div>
        <span className="text-xs border px-2 py-1 shrink-0">
          {statusLabel[linha.statusEfetivo]}
        </span>
      </div>

      <form
        action={async (fd) => {
          "use server";
          await mudarStatus(fd);
        }}
      >
        <input type="hidden" name="id" value={linha.id} />
        <input type="hidden" name="status" value={alvoToggle} />
        <button type="submit" className="text-sm underline">
          {pago ? "Reabrir" : "Marcar pago"}
        </button>
      </form>

      <details>
        <summary className="cursor-pointer text-sm">Editar / excluir</summary>

        <form
          action={async (fd) => {
            "use server";
            await editarLancamento(fd);
          }}
          className="flex flex-col gap-2 mt-2"
        >
          <input type="hidden" name="id" value={linha.id} />
          <input
            name="description"
            defaultValue={linha.description}
            aria-label={`Descrição de ${linha.description}`}
            required
            className="border px-4 py-3"
          />
          <input
            name="amount"
            inputMode="decimal"
            defaultValue={String(linha.amount)}
            aria-label={`Valor de ${linha.description}`}
            required
            className="border px-4 py-3"
          />
          <select
            name="movement"
            defaultValue={linha.movement}
            aria-label={`Movimento de ${linha.description}`}
            required
            className="border px-4 py-3"
          >
            <option value="income">Receita</option>
            <option value="expense">Despesa</option>
            <option value="investment">Investimento</option>
          </select>
          <input
            type="date"
            name="due_date"
            defaultValue={linha.due_date}
            aria-label={`Vencimento de ${linha.description}`}
            required
            className="border px-4 py-3"
          />
          <select
            name="account_id"
            defaultValue={linha.account_id ?? ""}
            aria-label={`Conta de ${linha.description}`}
            className="border px-4 py-3"
          >
            <option value="">Sem conta</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            name="category_id"
            defaultValue={linha.category_id ?? ""}
            aria-label={`Categoria de ${linha.description}`}
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
            defaultValue={linha.subcategory_id ?? ""}
            aria-label={`Subcategoria de ${linha.description}`}
            className="border px-4 py-3"
          >
            <option value="">Sem subcategoria</option>
            {subcategorias.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="submit" className="border px-4 py-3">
            Salvar
          </button>
        </form>

        {linha.installment_group_id ? (
          <form
            action={async (fd) => {
              "use server";
              await excluirGrupoParcelas(fd);
            }}
            className="mt-2"
          >
            <input type="hidden" name="installment_group_id" value={linha.installment_group_id} />
            <button type="submit" className="text-sm text-red-700 underline">
              Excluir todas as parcelas ({linha.installment_total})
            </button>
          </form>
        ) : (
          <form
            action={async (fd) => {
              "use server";
              await excluirLancamento(fd);
            }}
            className="mt-2"
          >
            <input type="hidden" name="id" value={linha.id} />
            <button type="submit" className="text-sm text-red-700 underline">
              Excluir
            </button>
          </form>
        )}
      </details>
    </li>
  );
}
