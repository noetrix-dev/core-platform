"use client";

import { useAgenda, getCliente, getServico } from "@/lib/agenda/store";
import { vagasLivres } from "@/lib/agenda/timeline";
import { minToHm } from "@/lib/agenda/time";
import { Countdown } from "./Countdown";
import { Icon } from "./Icon";
import styles from "@/app/agenda/agenda.module.css";

export function ExceptionTray() {
  const { state, dispatch } = useAgenda();
  const { data, dayKey } = state;

  const fila = [...data.fila].sort((a, b) => a.posicao - b.posicao);
  const encaixes = data.encaixes;

  const filaAtiva = fila.filter(
    (f) => f.status === "aguardando" || f.status === "notificado",
  ).length;
  const encAtivos = encaixes.filter((e) => e.status === "pendente").length;

  return (
    <div className="flex flex-col gap-4">
      {/* FILA DE ESPERA */}
      <div className={styles.tray}>
        <div className={styles.tray__head}>
          <span>Fila de espera</span>
          <span className={`${styles.tray__count} ${styles.tnum}`}>
            {filaAtiva} na fila
          </span>
        </div>
        <ul className="flex flex-col gap-2.5 p-2.5">
          {fila.map((f) => {
            const cli = getCliente(data, f.cliente_id);
            const svc = f.servico_id ? getServico(data, f.servico_id) : undefined;
            const dur = svc?.duracao_minutos ?? 30;
            const vaga = vagasLivres(data, dayKey, dur)[0];
            return (
              <li
                key={f.id}
                className={styles.slip}
                data-status={f.status}
                data-kind="fila"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={styles.slip__name}>
                      <span className={styles.slip__pos}>{f.posicao}.</span>{" "}
                      {cli?.nome}
                    </p>
                    <p className={styles.slip__meta}>
                      {svc?.nome ?? "Qualquer serviço"}
                      {f.status === "notificado" && " · avisado"}
                      {f.status === "confirmado" && " · encaixado"}
                      {f.status === "expirado" && " · não respondeu"}
                    </p>
                  </div>
                  {f.status === "notificado" && (
                    <Countdown expiraEm={f.expira_em} />
                  )}
                </div>

                {f.status === "aguardando" && (
                  <div className="mt-2">
                    <button
                      type="button"
                      className={`${styles.btn} ${styles["btn--ghost"]}`}
                      onClick={() =>
                        dispatch({ type: "NOTIFICAR_FILA", filaId: f.id })
                      }
                    >
                      <Icon name="bell" size={15} /> Avisar
                    </button>
                  </div>
                )}
                {f.status === "notificado" && (
                  <div className="mt-2">
                    <button
                      type="button"
                      className={`${styles.btn} ${styles["btn--primary"]}`}
                      disabled={vaga == null}
                      onClick={() =>
                        vaga != null &&
                        dispatch({
                          type: "CONFIRMAR_FILA",
                          filaId: f.id,
                          inicioMin: vaga,
                        })
                      }
                    >
                      {vaga != null
                        ? `Encaixar ${minToHm(vaga)}`
                        : "Sem vaga hoje"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* PEDIDOS DE ENCAIXE */}
      <div className={styles.tray}>
        <div className={styles.tray__head}>
          <span>Pedidos de encaixe</span>
          <span className={`${styles.tray__count} ${styles.tnum}`}>
            {encAtivos} aberto{encAtivos === 1 ? "" : "s"}
          </span>
        </div>
        <ul className="flex flex-col gap-2.5 p-2.5">
          {encaixes.length === 0 && (
            <li className={styles.slip__meta}>Nenhum pedido no momento.</li>
          )}
          {encaixes.map((e) => {
            const cli = getCliente(data, e.cliente_id);
            const svc = getServico(data, e.servico_id);
            const min =
              new Date(e.horario_solicitado).getHours() * 60 +
              new Date(e.horario_solicitado).getMinutes();
            return (
              <li
                key={e.id}
                className={styles.slip}
                data-status={e.status}
                data-kind="encaixe"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={styles.slip__name}>{cli?.nome}</p>
                    <p className={styles.slip__meta}>
                      {svc?.nome} · pediu{" "}
                      <span className={styles.tnum}>{minToHm(min)}</span>
                      {e.status === "confirmado" && " · aceito"}
                      {e.status === "recusado" && " · recusado"}
                      {e.status === "expirado" && " · expirou"}
                    </p>
                  </div>
                  {e.status === "pendente" && (
                    <Countdown expiraEm={e.expira_em} />
                  )}
                </div>
                {e.status === "pendente" && (
                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      className={`${styles.btn} ${styles["btn--primary"]}`}
                      onClick={() =>
                        dispatch({ type: "ACEITAR_ENCAIXE", encId: e.id })
                      }
                    >
                      <Icon name="check" size={15} /> Aceitar
                    </button>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles["btn--ghost"]}`}
                      onClick={() =>
                        dispatch({ type: "RECUSAR_ENCAIXE", encId: e.id })
                      }
                    >
                      Recusar
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
