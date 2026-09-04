import type { AccountRow } from "@/lib/financas/types";
import { criarConta, editarConta } from "@/app/configuracoes/actions";

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
              <form
                action={async (fd) => {
                  "use server";
                  await editarConta(fd);
                }}
                className="flex flex-col gap-2 mt-2"
              >
                <input type="hidden" name="id" value={conta.id} />
                <input
                  name="name"
                  defaultValue={conta.name}
                  aria-label={`Nome de ${conta.name}`}
                  required
                  className="border px-4 py-3"
                />
                <select
                  name="bank"
                  defaultValue={conta.bank}
                  aria-label={`Banco de ${conta.name}`}
                  required
                  className="border px-4 py-3"
                >
                  <option value="inter">Inter</option>
                  <option value="nubank">Nubank</option>
                  <option value="bradesco">Bradesco</option>
                  <option value="btg">BTG</option>
                </select>
                <select
                  name="type"
                  defaultValue={conta.type}
                  aria-label={`Tipo de ${conta.name}`}
                  required
                  className="border px-4 py-3"
                >
                  <option value="corrente">Corrente</option>
                  <option value="poupanca">Poupança</option>
                  <option value="investimento">Investimento</option>
                </select>
                <input
                  name="balance"
                  inputMode="decimal"
                  defaultValue={String(conta.balance)}
                  aria-label={`Saldo de ${conta.name}`}
                  required
                  className="border px-4 py-3"
                />
                {(conta.bank === "nubank" || conta.bank === "inter") && (
                  <>
                    <input
                      name="fatura_atual"
                      inputMode="decimal"
                      placeholder="Fatura atual (opcional)"
                      defaultValue={conta.fatura_atual != null ? String(conta.fatura_atual) : ""}
                      aria-label={`Fatura atual de ${conta.name}`}
                      className="border px-4 py-3"
                    />
                    <input
                      name="limite_disponivel"
                      inputMode="decimal"
                      placeholder="Limite disponível (opcional)"
                      defaultValue={
                        conta.limite_disponivel != null ? String(conta.limite_disponivel) : ""
                      }
                      aria-label={`Limite disponível de ${conta.name}`}
                      className="border px-4 py-3"
                    />
                  </>
                )}
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="ativo" value="true" defaultChecked={conta.ativo} />
                  Conta ativa
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
