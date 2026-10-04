"use client";

import { rotuloDia } from "@/lib/agendar/formato";
import { fmtPreco } from "@/lib/agenda/time";
import type { ResumoAgendamento } from "./actions";
import styles from "@/app/agenda/agenda.module.css";
import css from "./agendar.module.css";

export function EtapaSucesso({ resumo, onNovo }: { resumo: ResumoAgendamento; onNovo: () => void }) {
  return (
    <>
      <h1 tabIndex={-1} className={`${styles.pageTitle} mb-4`}>Agendado!</h1>
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
      {resumo.emailMascarado && (
        <p className={`${styles.msgQuiet} mt-3`}>Enviamos a confirmação para {resumo.emailMascarado}.</p>
      )}
      <button type="button" className={`${styles.btn} mt-6 w-full ${css.cta}`} onClick={onNovo}>
        Fazer outro agendamento
      </button>
    </>
  );
}
