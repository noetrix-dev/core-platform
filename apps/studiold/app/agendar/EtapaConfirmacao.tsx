"use client";

import { rotuloDia } from "@/lib/agendar/formato";
import { fmtPreco } from "@/lib/agenda/time";
import type { Catalogo, Horario, OpcaoCatalogo } from "./actions";
import styles from "@/app/agenda/agenda.module.css";
import css from "./agendar.module.css";

type Props = {
  catalogo: Catalogo;
  servicoIds: string[];
  horario: Horario;
  cortesiaId: string | null;
  estiloId: string | null;
  onCortesia: (id: string | null) => void;
  onEstilo: (id: string | null) => void;
  onConfirmar: () => void;
  pendente: boolean;
  erro: string | null;
};

function Escolha({
  titulo,
  opcoes,
  valor,
  onEscolher,
}: {
  titulo: string;
  opcoes: OpcaoCatalogo[];
  valor: string | null;
  onEscolher: (id: string | null) => void;
}) {
  if (opcoes.length === 0) return null;
  const todas: { id: string | null; nome: string }[] = [...opcoes, { id: null, nome: "Nenhuma" }];
  return (
    <section>
      <h2 className={css.grupoTitulo} id={`escolha-${titulo}`}>
        {titulo}
      </h2>
      <div className={styles.chips} role="radiogroup" aria-labelledby={`escolha-${titulo}`}>
        {todas.map((o) => (
          <button
            key={o.id ?? "nenhuma"}
            type="button"
            role="radio"
            aria-checked={valor === o.id}
            className={`${styles.chip} min-h-11`}
            data-on={valor === o.id ? "true" : undefined}
            onClick={() => onEscolher(o.id)}
          >
            {o.nome}
          </button>
        ))}
      </div>
    </section>
  );
}

export function EtapaConfirmacao(p: Props) {
  const servicos = p.catalogo.servicos.filter((s) => p.servicoIds.includes(s.id));
  const total = servicos.reduce((t, s) => t + s.preco, 0);
  const minutos = servicos.reduce((t, s) => t + s.duracaoMin, 0);

  return (
    <>
      <h1 className={`${styles.pageTitle} mb-4`}>Confere?</h1>
      <div className={css.comanda}>
        <p className={css.comandaDestaque}>
          {rotuloDia(p.horario.data)} às {p.horario.hora}
        </p>
        {servicos.map((s) => (
          <div key={s.id} className={css.comandaLinha}>
            <span>{s.nome}</span>
            <span className={styles.tnum}>{fmtPreco(s.preco)}</span>
          </div>
        ))}
        <div className={css.comandaTotal}>
          <span>Total · {minutos} min</span>
          <span>{fmtPreco(total)}</span>
        </div>
      </div>

      <Escolha titulo="Cortesia" opcoes={p.catalogo.cortesias} valor={p.cortesiaId} onEscolher={p.onCortesia} />
      <Escolha titulo="Estilo de música" opcoes={p.catalogo.estilos} valor={p.estiloId} onEscolher={p.onEstilo} />

      {p.erro && (
        <p role="alert" className={`${styles.msgQuiet} mt-4`} data-tom="erro">
          {p.erro}
        </p>
      )}
      <button
        type="button"
        className={`${styles.btn} ${styles["btn--primary"]} mt-6 w-full ${css.cta}`}
        disabled={p.pendente}
        onClick={p.onConfirmar}
      >
        {p.pendente ? "Confirmando…" : "Confirmar agendamento"}
      </button>
    </>
  );
}
