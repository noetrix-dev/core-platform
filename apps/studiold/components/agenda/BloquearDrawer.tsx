"use client";

import { useState, type FormEvent } from "react";
import { useAgenda } from "@/lib/agenda/store";
import { Drawer } from "./Drawer";
import styles from "@/app/agenda/agenda.module.css";

export function BloquearDrawer({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useAgenda();
  const [dataKey, setDataKey] = useState(state.dayKey);
  const [inicio, setInicio] = useState("13:00");
  const [fim, setFim] = useState("14:00");
  const [descricao, setDescricao] = useState("");

  const valido = inicio < fim;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!valido) return;
    dispatch({
      type: "BLOQUEAR",
      dataKey,
      horaInicio: inicio,
      horaFim: fim,
      descricao: descricao.trim(),
    });
    onClose();
  };

  return (
    <Drawer titulo="Bloquear horário" onClose={onClose}>
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <div className={`${styles.field} flex flex-col gap-1.5`}>
          <label htmlFor="bloq-data">Data</label>
          <input
            id="bloq-data"
            type="date"
            value={dataKey}
            onChange={(e) => setDataKey(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <div className={`${styles.field} flex flex-1 flex-col gap-1.5`}>
            <label htmlFor="bloq-ini">Início</label>
            <input
              id="bloq-ini"
              type="time"
              step={900}
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <div className={`${styles.field} flex flex-1 flex-col gap-1.5`}>
            <label htmlFor="bloq-fim">Fim</label>
            <input
              id="bloq-fim"
              type="time"
              step={900}
              value={fim}
              onChange={(e) => setFim(e.target.value)}
            />
          </div>
        </div>
        {!valido && (
          <p className={styles.slip__meta} style={{ color: "var(--oxblood)" }}>
            O fim precisa ser depois do início.
          </p>
        )}
        <div className={`${styles.field} flex flex-col gap-1.5`}>
          <label htmlFor="bloq-desc">Motivo (opcional)</label>
          <input
            id="bloq-desc"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Dentista, entrega, folga…"
            autoComplete="off"
          />
        </div>
        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            className={`${styles.btn} ${styles["btn--primary"]}`}
            disabled={!valido}
          >
            Bloquear
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles["btn--ghost"]}`}
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Drawer>
  );
}
