import type { AccountRow } from "@/lib/financas/types";
import { criarConta } from "@/app/configuracoes/actions";
import { EditarContaForm } from "@/components/configuracoes/EditarContaForm";

const bankLabel: Record<AccountRow["bank"], string> = {
  inter: "Inter",
  nubank: "Nubank",
  bradesco: "Bradesco",
  btg: "BTG",
};

const typeLabel: Record<AccountRow["type"], string> = {
  corrente: "Corrente",
  poupanca: "Poupança",
  investimento: "Investimento",
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function SecaoContas({ contas }: { contas: AccountRow[] }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Contas</h2>

      <form
        action={async (fd) => {
          "use server";
          await criarConta(fd);
        }}
        className="flex flex-col gap-2 border p-4"
      >
        <input
          name="name"
          placeholder="Nome da conta"
          aria-label="Nome da nova conta"
          required
          className="border px-4 py-3"
        />
        <select name="bank" aria-label="Banco da nova conta" required className="border px-4 py-3">
          <option value="">Selecione o banco</option>
          <option value="inter">Inter</option>
          <option value="nubank">Nubank</option>
          <option value="bradesco">Bradesco</option>
          <option value="btg">BTG</option>
        </select>
        <select name="type" aria-label="Tipo da nova conta" required className="border px-4 py-3">
          <option value="">Selecione o tipo</option>
          <option value="corrente">Corrente</option>
          <option value="poupanca">Poupança</option>
          <option value="investimento">Investimento</option>
        </select>
        <input
          name="balance"
          inputMode="decimal"
          placeholder="Saldo inicial (opcional)"
          aria-label="Saldo inicial da nova conta"
          className="border px-4 py-3"
        />
        <button type="submit" className="border px-4 py-3">
          Adicionar conta
        </button>
      </form>

      {contas.length === 0 && <p>Nenhuma conta cadastrada.</p>}

      <ul className="flex flex-col gap-3">
        {contas.map((conta) => (
          <li key={conta.id} className="border p-4" data-inativo={conta.ativo ? undefined : "true"}>
            <p className="font-medium">
              {conta.name}
              {!conta.ativo && " (inativa)"}
            </p>
            <p className="text-sm text-gray-500">
              {bankLabel[conta.bank]} · {typeLabel[conta.type]} · saldo {brl(conta.balance)}
            </p>
            {(conta.bank === "nubank" || conta.bank === "inter") && (
              <p className="text-sm text-gray-500">
                Fatura atual {conta.fatura_atual != null ? brl(conta.fatura_atual) : "—"} · Limite
                disponível {conta.limite_disponivel != null ? brl(conta.limite_disponivel) : "—"}
              </p>
            )}

            <details className="mt-2">
              <summary className="cursor-pointer">Editar</summary>
              <EditarContaForm conta={conta} />
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
