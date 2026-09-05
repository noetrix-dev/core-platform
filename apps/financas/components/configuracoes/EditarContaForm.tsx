"use client";

import { useActionState } from "react";
import { editarConta, type Resultado } from "@/app/configuracoes/actions";
import type { AccountRow } from "@/lib/financas/types";

const INICIAL: Resultado = { ok: true };

export function EditarContaForm({ conta }: { conta: AccountRow }) {
  const [estado, acao, pendente] = useActionState(
    (_prev: Resultado, fd: FormData) => editarConta(fd),
    INICIAL,
  );

  return (
    <form action={acao} className="flex flex-col gap-2 mt-2">
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
            defaultValue={conta.limite_disponivel != null ? String(conta.limite_disponivel) : ""}
            aria-label={`Limite disponível de ${conta.name}`}
            className="border px-4 py-3"
          />
        </>
      )}
      <label className="flex items-center gap-2">
        <input type="checkbox" name="ativo" value="true" defaultChecked={conta.ativo} />
        Conta ativa
      </label>

      {!estado.ok && (
        <p role="alert" className="text-sm text-red-700">
          {estado.erro}
        </p>
      )}

      <button type="submit" disabled={pendente} className="border px-4 py-3">
        {pendente ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}
