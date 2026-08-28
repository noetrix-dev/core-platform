"use client";

// Drawer de conclusão: coleta valor cobrado, forma de pagamento e cortesia
// servida. Presentational — não despacha nem faz I/O; chama onConfirmar.

import { useMemo, useState, type FormEvent } from "react";
import { useAgenda } from "@/lib/agenda/store";
import { Drawer } from "./Drawer";
import { Icon } from "./Icon";
import styles from "@/app/agenda/agenda.module.css";

type Forma = "pix" | "cartao_debito" | "cartao_credito" | "dinheiro";

const FORMAS: { key: Forma; label: string }[] = [
  { key: "pix", label: "Pix" },
  { key: "cartao_debito", label: "Cartão débito" },
  { key: "cartao_credito", label: "Cartão crédito" },
  { key: "dinheiro", label: "Dinheiro" },
];

export function PagamentoDrawer({
  valorSugerido,
  cortesiaIdInicial,
  onConfirmar,
  onClose,
}: {
  valorSugerido: number;
  cortesiaIdInicial?: string;
  onConfirmar: (p: {
    valor: number;
    forma: Forma;
    cortesiaId?: string;
  }) => void;
  onClose: () => void;
}) {
  const { state } = useAgenda();
  const { data } = state;

  const [valorTxt, setValorTxt] = useState(
    valorSugerido.toFixed(2).replace(".", ","),
  );
  const [forma, setForma] = useState<Forma | null>(null);
  const [cortesiaId, setCortesiaId] = useState<string | null>(
    cortesiaIdInicial ?? null,
  );
  const [enviando, setEnviando] = useState(false);

  // ativas com estoque + a cortesia já escolhida no agendamento (mesmo sem estoque)
  const cortesias = useMemo(() => {
    const ativas = data.cortesias.filter(
      (c) => c.ativo && c.quantidade_estoque > 0,
    );
    if (cortesiaIdInicial && !ativas.some((c) => c.id === cortesiaIdInicial)) {
      const inicial = data.cortesias.find((c) => c.id === cortesiaIdInicial);
      if (inicial) return [inicial, ...ativas];
    }
    return ativas;
  }, [data.cortesias, cortesiaIdInicial]);

  const valor = Number(valorTxt.replace(/\./g, "").replace(",", "."));
  const valorOk = Number.isFinite(valor) && valor >= 0;
  const podeEnviar = valorOk && forma != null && !enviando;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!podeEnviar || forma == null) return;
    setEnviando(true);
    onConfirmar({ valor, forma, cortesiaId: cortesiaId ?? undefined });
  };

  return (
    <Drawer titulo="Concluir atendimento" onClose={onClose}>
      <form onSubmit={enviar} className="flex min-h-full flex-col gap-4">
        <div className={`${styles.field} flex flex-col gap-1.5`}>
          <label htmlFor="pag-valor">Valor cobrado (R$)</label>
          <input
            id="pag-valor"
            inputMode="decimal"
            value={valorTxt}
            onChange={(e) => setValorTxt(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className={`${styles.field} flex flex-col gap-1.5`}>
          <label>Forma de pagamento</label>
          <div
            className={styles.pagFormas}
            role="radiogroup"
            aria-label="Forma de pagamento"
          >
            {FORMAS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={styles.chip}
                data-on={forma === f.key}
                role="radio"
                aria-checked={forma === f.key}
                onClick={() => setForma(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className={`${styles.field} flex flex-col gap-1.5`}>
          <label>Cortesia (opcional)</label>
          <div className={styles.chips} role="radiogroup" aria-label="Cortesia">
            <button
              type="button"
              className={styles.chip}
              data-on={cortesiaId === null}
              role="radio"
              aria-checked={cortesiaId === null}
              onClick={() => setCortesiaId(null)}
            >
              Nenhuma
            </button>
            {cortesias.map((c) => (
              <button
                key={c.id}
                type="button"
                className={styles.chip}
                data-on={cortesiaId === c.id}
                role="radio"
                aria-checked={cortesiaId === c.id}
                onClick={() => setCortesiaId(c.id)}
              >
                {c.nome}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.pagDock}>
          <button
            type="submit"
            className={`${styles.btn} ${styles["btn--primary"]} w-full justify-center`}
            disabled={!podeEnviar}
          >
            <Icon name="check" size={15} /> Concluir e registrar
          </button>
        </div>
      </form>
    </Drawer>
  );
}
