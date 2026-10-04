"use client";

import { useState } from "react";
import { rotuloDia, turno } from "@/lib/agendar/formato";
import type { Horario } from "./actions";
import styles from "@/app/agenda/agenda.module.css";
import css from "./agendar.module.css";

type Props = {
  horarios: Horario[] | null; // null = primeira carga
  carregando: boolean;
  temMais: boolean;
  aviso: string | null;
  onEscolher: (h: Horario) => void;
  onMaisDias: () => void;
};

export function EtapaHorario({ horarios, carregando, temMais, aviso, onEscolher, onMaisDias }: Props) {
  const dias = horarios ? [...new Set(horarios.map((h) => h.data))] : [];
  const [diaEscolhido, setDiaEscolhido] = useState<string | null>(null);
  const dia = diaEscolhido && dias.includes(diaEscolhido) ? diaEscolhido : (dias[0] ?? null);
  const doDia = horarios?.filter((h) => h.data === dia) ?? [];
  const manha = doDia.filter((h) => turno(h.hora) === "manha");
  const tarde = doDia.filter((h) => turno(h.hora) === "tarde");

  function bloco(titulo: string, itens: Horario[]) {
    if (itens.length === 0) return null;
    return (
      <section aria-label={titulo}>
        <h2 className={css.grupoTitulo}>{titulo}</h2>
        <div className={css.grade}>
          {itens.map((h) => (
            <button
              key={h.inicio}
              type="button"
              className={`${styles.btn} ${css.slot}`}
              aria-label={`${rotuloDia(h.data)} às ${h.hora}`}
              onClick={() => onEscolher(h)}
            >
              {h.hora}
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <>
      <h1 tabIndex={-1} className={styles.pageTitle}>Quando?</h1>
      {aviso && (
        <p role="alert" className={`${styles.msgQuiet} mt-1`} data-tom="erro">
          {aviso}
        </p>
      )}

      {horarios === null ? (
        <div className={`${css.lista} mt-5`} aria-busy="true" aria-label="Carregando horários">
          {[0, 1, 2].map((i) => (
            <div key={i} className={css.esqueleto} />
          ))}
        </div>
      ) : dias.length === 0 ? (
        <p className={`${styles.msgQuiet} mt-4`}>
          Não há horário livre nos próximos 60 dias para esses serviços. Fale direto com a barbearia pelo
          WhatsApp.
        </p>
      ) : (
        <>
          <div className={`${css.dias} mt-4`} role="group" aria-label="Dia">
            {dias.map((d) => (
              <button
                key={d}
                type="button"
                className={`${styles.chip} ${css.dia}`}
                data-on={d === dia ? "true" : undefined}
                aria-pressed={d === dia}
                onClick={() => setDiaEscolhido(d)}
              >
                {rotuloDia(d)}
              </button>
            ))}
            {temMais && (
              <button
                type="button"
                className={`${styles.btn} ${styles["btn--ghost"]} ${css.dia}`}
                disabled={carregando}
                onClick={onMaisDias}
              >
                {carregando ? "Buscando…" : "Ver mais dias"}
              </button>
            )}
          </div>
          {bloco("Manhã", manha)}
          {bloco("Tarde", tarde)}
        </>
      )}
    </>
  );
}
