"use client";

// Drawer de conclusão: valor cobrado, forma de pagamento, cortesia e a lista
// de itens (serviço principal fixo + serviços extras + produtos). Total corrente
// espelha o campo de valor até o barbeiro editá-lo à mão. Presentational.

import { useMemo, useState, type FormEvent } from "react";
import { useAgenda } from "@/lib/agenda/store";
import { somaItens, type ItemPagamento } from "@/lib/agenda/pagamento";
import { fmtPreco } from "@/lib/agenda/time";
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

const brl = (n: number) => n.toFixed(2).replace(".", ",");
const parseBRL = (t: string) => {
  const s = t.trim();
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return { n, ok: s !== "" && Number.isFinite(n) && n >= 0 };
};

let seq = 0;
const novaKey = () => `it-${++seq}`;

export function PagamentoDrawer({
  valorSugerido,
  servicoId,
  servicoNome,
  cortesiaIdInicial,
  onConfirmar,
  onClose,
}: {
  valorSugerido: number;
  servicoId: string;
  servicoNome: string;
  cortesiaIdInicial?: string;
  onConfirmar: (p: {
    valor: number;
    forma: Forma;
    cortesiaId?: string;
    itens: {
      tipo: "servico" | "produto";
      refId: string;
      descricao: string;
      quantidade: number;
      precoUnitario: number;
    }[];
  }) => void;
  onClose: () => void;
}) {
  const { state } = useAgenda();
  const { data } = state;

  const [itens, setItens] = useState<ItemPagamento[]>(() => [
    {
      key: novaKey(),
      tipo: "servico",
      refId: servicoId,
      descricao: servicoNome,
      quantidade: 1,
      precoUnitario: valorSugerido,
      fixo: true,
    },
  ]);
  const total = somaItens(itens);

  const [valorTxt, setValorTxt] = useState(brl(valorSugerido));
  const [valorAuto, setValorAuto] = useState(true);
  const [forma, setForma] = useState<Forma | null>(null);
  const [cortesiaId, setCortesiaId] = useState<string | null>(
    cortesiaIdInicial ?? null,
  );
  const [enviando, setEnviando] = useState(false);

  // reescreve o campo de valor com o total enquanto o barbeiro não o tocar
  const setItensERecalc = (prox: ItemPagamento[]) => {
    setItens(prox);
    if (valorAuto) setValorTxt(brl(somaItens(prox)));
  };
  const patchItem = (key: string, p: Partial<ItemPagamento>) =>
    setItensERecalc(itens.map((i) => (i.key === key ? { ...i, ...p } : i)));
  const removerItem = (key: string) =>
    setItensERecalc(itens.filter((i) => i.key !== key));

  const addServico = (id: string) => {
    const s = data.servicos.find((x) => x.id === id);
    if (!s) return;
    setItensERecalc([
      ...itens,
      { key: novaKey(), tipo: "servico", refId: s.id, descricao: s.nome, quantidade: 1, precoUnitario: s.preco, fixo: false },
    ]);
  };
  const addProduto = (id: string) => {
    const p = data.produtos.find((x) => x.id === id);
    if (!p) return;
    setItensERecalc([
      ...itens,
      { key: novaKey(), tipo: "produto", refId: p.id, descricao: p.nome, quantidade: 1, precoUnitario: p.preco_venda, fixo: false },
    ]);
  };

  const produtosDisponiveis = useMemo(
    () => data.produtos.filter((p) => p.quantidade_estoque > 0),
    [data.produtos],
  );
  const estoqueDe = (refId: string) =>
    data.produtos.find((p) => p.id === refId)?.quantidade_estoque ?? 0;

  const cortesias = useMemo(() => {
    const ativas = data.cortesias.filter((c) => c.ativo && c.quantidade_estoque > 0);
    if (cortesiaIdInicial && !ativas.some((c) => c.id === cortesiaIdInicial)) {
      const inicial = data.cortesias.find((c) => c.id === cortesiaIdInicial);
      if (inicial) return [inicial, ...ativas];
    }
    return ativas;
  }, [data.cortesias, cortesiaIdInicial]);

  const { n: valor, ok: valorOk } = parseBRL(valorTxt);
  const podeEnviar = valorOk && forma != null && !enviando;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!podeEnviar || forma == null) return;
    setEnviando(true);
    onConfirmar({
      valor,
      forma,
      cortesiaId: cortesiaId ?? undefined,
      itens: itens.map((i) => ({
        tipo: i.tipo,
        refId: i.refId,
        descricao: i.descricao,
        quantidade: i.quantidade,
        precoUnitario: i.precoUnitario,
      })),
    });
  };

  return (
    <Drawer titulo="Concluir atendimento" onClose={onClose}>
      <form onSubmit={enviar} className="flex min-h-full flex-col gap-4">
        {/* ITENS */}
        <div className={`${styles.field} flex flex-col gap-2`}>
          <label>Itens</label>
          {itens.map((i) => (
            <div key={i.key} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate">{i.descricao}</span>
              {i.tipo === "produto" ? (
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    className={styles.chip}
                    aria-label={`Menos um de ${i.descricao}`}
                    onClick={() =>
                      patchItem(i.key, { quantidade: Math.max(1, i.quantidade - 1) })
                    }
                  >
                    −
                  </button>
                  <span className={styles.tnum} aria-label="quantidade">
                    {i.quantidade}
                  </span>
                  <button
                    type="button"
                    className={styles.chip}
                    aria-label={`Mais um de ${i.descricao}`}
                    onClick={() =>
                      patchItem(i.key, {
                        quantidade: Math.min(estoqueDe(i.refId), i.quantidade + 1),
                      })
                    }
                  >
                    +
                  </button>
                </span>
              ) : (
                <span className={styles.tnum}>1×</span>
              )}
              <input
                inputMode="decimal"
                className={styles.cfgEstoqueEdit}
                value={brl(i.precoUnitario)}
                aria-label={`Preço unitário de ${i.descricao}`}
                onChange={(e) => {
                  const { n, ok } = parseBRL(e.target.value);
                  if (ok) patchItem(i.key, { precoUnitario: n });
                }}
              />
              <span className={`${styles.tnum} w-16 text-right`}>
                {fmtPreco(
                  Math.round(i.quantidade * i.precoUnitario * 100) / 100,
                )}
              </span>
              {!i.fixo && (
                <button
                  type="button"
                  className={styles.iconbtn}
                  aria-label={`Remover ${i.descricao}`}
                  onClick={() => removerItem(i.key)}
                >
                  <Icon name="x" size={13} />
                </button>
              )}
            </div>
          ))}

          <div className="flex gap-2">
            <select
              aria-label="Adicionar serviço"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) addServico(e.target.value);
                e.currentTarget.value = "";
              }}
            >
              <option value="">+ Serviço</option>
              {data.servicos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
            <select
              aria-label="Adicionar produto"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) addProduto(e.target.value);
                e.currentTarget.value = "";
              }}
            >
              <option value="">+ Produto</option>
              {produtosDisponiveis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} ({p.quantidade_estoque})
                </option>
              ))}
            </select>
          </div>

          <p className={`${styles.slip__meta} text-right`}>
            Total dos itens: {fmtPreco(total)}
          </p>
        </div>

        <div className={`${styles.field} flex flex-col gap-1.5`}>
          <label htmlFor="pag-valor">Valor cobrado (R$)</label>
          <input
            id="pag-valor"
            inputMode="decimal"
            value={valorTxt}
            onChange={(e) => {
              setValorAuto(false);
              setValorTxt(e.target.value);
            }}
            autoComplete="off"
          />
        </div>

        <div className={`${styles.field} flex flex-col gap-1.5`}>
          <label>Forma de pagamento</label>
          <div className={styles.pagFormas} role="radiogroup" aria-label="Forma de pagamento">
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
