"use client";

import { useState } from "react";
import type { ItemFicha } from "@/lib/agenda/timeline";
import { useAgenda } from "@/lib/agenda/store";
import { desde, fmtPreco, minToHm } from "@/lib/agenda/time";
import { Icon } from "./Icon";
import styles from "@/app/agenda/agenda.module.css";

export function HeroFicha({
  item,
  agoraLabel,
}: {
  item: ItemFicha;
  agoraLabel: string;
}) {
  const { dispatch } = useAgenda();
  const { agendamento: ag, cliente, servico } = item;
  const [carimbo, setCarimbo] = useState(false);
  const naCadeira = ag.em_atendimento;

  const concluir = () => {
    setCarimbo(true);
    setTimeout(() => dispatch({ type: "CONCLUIR", agId: ag.id }), 300);
  };

  const hist =
    cliente == null
      ? null
      : cliente.total_visitas === 0
        ? "primeira vez na StudiOLD"
        : `${cliente.total_visitas}ª visita · última ${desde(cliente.ultima_visita) ?? "—"}`;

  return (
    <section
      className={`${styles.hero} ${carimbo ? styles.stamped : ""}`}
      aria-label={`No espelho: ${cliente?.nome ?? "cliente"}`}
    >
      <div className={styles.hero__frame}>
        <span className={styles.label}>
          {naCadeira ? "Na cadeira" : "Próximo"}
        </span>
        <span className={`${styles.now} ${styles.tnum}`}>{agoraLabel}</span>
      </div>

      <div className={styles.hero__body}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className={styles.hero__name}>{cliente?.nome}</h2>
            <p className={styles.hero__svc}>
              {servico?.nome}{" "}
              <span className={styles.hero__num}>
                · {minToHm(item.inicioMin)}–{minToHm(item.fimMin)} ·{" "}
                {ag.duracao_minutos} min ·{" "}
                {servico ? fmtPreco(servico.preco) : ""}
              </span>
            </p>
          </div>
        </div>

        {cliente?.telefone && (
          <p className="mt-2 flex items-center gap-1.5 text-sm" style={{ color: "var(--ink-2)" }}>
            <Icon name="phone" size={15} />
            <span className={styles.tnum}>{cliente.telefone}</span>
          </p>
        )}

        {ag.observacoes && (
          <p className={`${styles.hero__note} mt-2`}>{ag.observacoes}</p>
        )}
        {cliente?.observacoes && (
          <p className={`${styles.hero__note} mt-2`}>{cliente.observacoes}</p>
        )}

        {hist && <p className={`${styles.hero__hist} mt-3`}>{hist}</p>}

        <div className="mt-3 flex flex-wrap gap-2">
          {naCadeira ? (
            <button
              type="button"
              className={`${styles.btn} ${styles["btn--primary"]}`}
              onClick={concluir}
            >
              <Icon name="check" size={15} /> Concluir atendimento
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.btn} ${styles["btn--primary"]}`}
              onClick={() => dispatch({ type: "CHECK_IN", agId: ag.id })}
            >
              <Icon name="scissors" size={15} /> Check-in
            </button>
          )}
          {!naCadeira && ag.status === "pendente" && (
            <button
              type="button"
              className={`${styles.btn} ${styles["btn--ghost"]}`}
              onClick={() => dispatch({ type: "CONFIRMAR_AG", agId: ag.id })}
            >
              Confirmar
            </button>
          )}
          {!naCadeira && (
            <button
              type="button"
              className={`${styles.btn} ${styles["btn--ghost"]}`}
              onClick={() => dispatch({ type: "FALTOU", agId: ag.id })}
            >
              Faltou
            </button>
          )}
          <button
            type="button"
            className={`${styles.btn} ${styles["btn--danger"]}`}
            onClick={() => dispatch({ type: "CANCELAR", agId: ag.id })}
          >
            Cancelar
          </button>
        </div>
      </div>
    </section>
  );
}
