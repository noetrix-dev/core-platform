"use client";

import { ehCombo } from "@/lib/agendar/formato";
import { fmtPreco } from "@/lib/agenda/time";
import type { Catalogo, ServicoCatalogo } from "./actions";
import styles from "@/app/agenda/agenda.module.css";
import css from "./agendar.module.css";

type Props = {
  nome: string;
  catalogo: Catalogo | null;
  selecionados: string[];
  onAlternar: (id: string) => void;
  onContinuar: () => void;
  pendente: boolean;
};

export function EtapaServicos({ nome, catalogo, selecionados, onAlternar, onContinuar, pendente }: Props) {
  const escolhidos = catalogo?.servicos.filter((s) => selecionados.includes(s.id)) ?? [];
  const total = escolhidos.reduce((t, s) => t + s.preco, 0);
  const minutos = escolhidos.reduce((t, s) => t + s.duracaoMin, 0);
  const combos = catalogo?.servicos.filter((s) => ehCombo(s.nome)) ?? [];
  const avulsos = catalogo?.servicos.filter((s) => !ehCombo(s.nome)) ?? [];

  function grupo(titulo: string, itens: ServicoCatalogo[]) {
    if (itens.length === 0) return null;
    return (
      <section aria-label={titulo}>
        <h2 className={css.grupoTitulo}>{titulo}</h2>
        <div className={css.lista}>
          {itens.map((s) => (
            <label key={s.id} className={css.linha}>
              <input
                type="checkbox"
                className={css.linhaCheck}
                checked={selecionados.includes(s.id)}
                onChange={() => onAlternar(s.id)}
              />
              <span className={css.linhaNome}>
                {s.nome}
                <span className={css.linhaMeta}>{s.duracaoMin} min</span>
              </span>
              <span className={css.linhaPreco}>{fmtPreco(s.preco)}</span>
            </label>
          ))}
        </div>
      </section>
    );
  }

  return (
    <>
      <h1 className={styles.pageTitle}>Olá, {nome}!</h1>
      <p className={styles.msgQuiet}>O que vamos fazer hoje? Pode escolher mais de um.</p>

      {catalogo ? (
        <>
          {grupo("Combos", combos)}
          {grupo("Serviços", avulsos)}
        </>
      ) : (
        <div className={`${css.lista} mt-5`} aria-busy="true" aria-label="Carregando serviços">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={css.esqueleto} />
          ))}
        </div>
      )}

      <div className={css.rodape}>
        <div className={css.rodapeInner}>
          <p className={css.rodapeTotal} aria-live="polite">
            {escolhidos.length === 0 ? (
              "Nenhum serviço"
            ) : (
              <>
                {fmtPreco(total)}
                <br />
                <span className="text-xs">{minutos} min</span>
              </>
            )}
          </p>
          <button
            type="button"
            className={`${styles.btn} ${styles["btn--primary"]} ${css.cta}`}
            disabled={escolhidos.length === 0 || pendente}
            onClick={onContinuar}
          >
            {pendente ? "Buscando…" : "Escolher horário"}
          </button>
        </div>
      </div>
    </>
  );
}
