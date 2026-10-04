"use client";

import Link from "next/link";
import { rotuloDia } from "@/lib/agendar/formato";
import { fmtPreco } from "@/lib/agenda/time";
import type { ResumoAgendamento } from "./actions";
import styles from "@/app/agenda/agenda.module.css";
import css from "./agendar.module.css";

export function EtapaSucesso({ resumo, onNovo }: { resumo: ResumoAgendamento; onNovo: () => void }) {
  return (
    <>
      <h1 tabIndex={-1} className={`${styles.pageTitle} mb-4`}>
        {resumo.remarcado ? "Remarcado!" : "Agendado!"}
      </h1>
      <div className={css.comanda}>
        <p className={css.comandaDestaque}>
          {rotuloDia(resumo.data)} às {resumo.hora}
        </p>
        {resumo.servicos.map((nome, i) => (
          <div key={`${nome}-${i}`} className={css.comandaLinha}>
            <span>{nome}</span>
          </div>
        ))}
        <div className={css.comandaTotal}>
          <span>Total · {resumo.duracaoMin} min</span>
          <span>{fmtPreco(resumo.valorTotal)}</span>
        </div>
      </div>
      {resumo.antigoNaoCancelado && (
        <p role="alert" className={`${styles.msgQuiet} mt-3`} data-tom="erro">
          Não conseguimos liberar seu horário anterior. Cancele em Meus agendamentos.
        </p>
      )}
      {resumo.emailMascarado && (
        <p className={`${styles.msgQuiet} mt-3`}>Enviamos a confirmação para {resumo.emailMascarado}.</p>
      )}
      <Link
        href="/agendar/meus-agendamentos"
        className={`${styles.btn} ${styles["btn--primary"]} mt-6 w-full ${css.cta}`}
      >
        Ver meus agendamentos
      </Link>
      <button type="button" className={`${styles.btn} mt-3 w-full ${css.cta}`} onClick={onNovo}>
        Fazer outro agendamento
      </button>
    </>
  );
}
