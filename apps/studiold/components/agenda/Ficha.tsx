"use client";

import { useState } from "react";
import type { ItemFicha } from "@/lib/agenda/timeline";
import { useAgenda } from "@/lib/agenda/store";
import { desde, fmtPreco, minToHm } from "@/lib/agenda/time";
import { Icon } from "./Icon";
import { PagamentoDrawer } from "./PagamentoDrawer";
import { PerfilClienteDrawer } from "@/components/PerfilClienteDrawer";
import styles from "@/app/agenda/agenda.module.css";

const SELO_TXT: Record<string, string> = {
  agendado: "AGENDADO",
  confirmado: "CONFIRMADO",
  concluido: "CONCLUÍDO",
  nao_compareceu: "FALTOU",
  cancelado: "CANCELADO",
};

const ORIGEM_TXT: Record<string, string> = {
  whatsapp: "WhatsApp",
  walkin: "Walk-in",
  encaixe: "Encaixe",
};

export function Ficha({ item }: { item: ItemFicha }) {
  const { dispatch } = useAgenda();
  const { agendamento: ag, cliente, servico } = item;
  const [carimbo, setCarimbo] = useState(false);

  const nome = cliente?.nome ?? "Cliente";
  const svcNome = servico?.nome ?? "Serviço";
  const preco = servico ? fmtPreco(servico.preco) : "";
  const faixa = `${minToHm(item.inicioMin)}–${minToHm(item.fimMin)}`;

  const [pagando, setPagando] = useState(false);
  const [verPerfil, setVerPerfil] = useState(false);

  const confirmarPagamento = (p: {
    valor: number;
    forma: "pix" | "cartao_debito" | "cartao_credito" | "dinheiro";
    cortesiaId?: string;
  }) => {
    setPagando(false);
    setCarimbo(true);
    setTimeout(
      () => dispatch({ type: "CONCLUIR_PAGAMENTO", agId: ag.id, ...p }),
      260,
    );
  };

  return (
    <div className={styles.row}>
      <div className={styles.gutter}>
        <span className={styles.tnum}>{minToHm(item.inicioMin)}</span>
        <small className={styles.tnum}>{ag.duracao_minutos} min</small>
      </div>

      <article
        className={`${styles.ficha} ${carimbo ? styles.stamped : ""}`}
        data-status={ag.status}
        data-em-atendimento={ag.em_atendimento ? "true" : undefined}
        aria-label={`${nome}, ${svcNome}, ${faixa}, ${SELO_TXT[ag.status]}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className={styles.ficha__name}>
              <button
                type="button"
                onClick={() => setVerPerfil(true)}
                className="text-left underline decoration-transparent underline-offset-2 hover:decoration-inherit"
                aria-label={`Ver perfil de ${nome}`}
              >
                {nome}
              </button>
            </h3>
            <p className={styles.ficha__meta}>
              {svcNome} · <span className={styles.tnum}>{preco}</span>
              {ag.origem !== "whatsapp" && (
                <>
                  {" · "}
                  <span className={styles.origem}>{ORIGEM_TXT[ag.origem]}</span>
                </>
              )}
            </p>
            {ag.cortesia_nome && (
              <p className={`${styles.ficha__meta} flex items-center gap-1`}>
                <Icon name="cup" size={13} /> {ag.cortesia_nome}
              </p>
            )}
          </div>
          <span className={styles.selo} data-s={ag.status}>
            {SELO_TXT[ag.status]}
          </span>
        </div>

        {ag.status === "agendado" && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              className={`${styles.btn} ${styles["btn--primary"]}`}
              onClick={() => dispatch({ type: "CONFIRMAR_PRESENCA", agId: ag.id })}
            >
              <Icon name="check" size={15} /> Confirmar presença
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles["btn--ghost"]}`}
              onClick={() => dispatch({ type: "FALTOU", agId: ag.id })}
            >
              Faltou
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles["btn--danger"]}`}
              onClick={() => dispatch({ type: "CANCELAR", agId: ag.id })}
            >
              Cancelar
            </button>
          </div>
        )}

        {ag.status === "confirmado" && !ag.em_atendimento && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              className={`${styles.btn} ${styles["btn--primary"]}`}
              onClick={() => dispatch({ type: "CHECK_IN", agId: ag.id })}
            >
              <Icon name="scissors" size={15} /> Check-in
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles["btn--ghost"]}`}
              onClick={() => dispatch({ type: "FALTOU", agId: ag.id })}
            >
              Faltou
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles["btn--danger"]}`}
              onClick={() => dispatch({ type: "CANCELAR", agId: ag.id })}
            >
              Cancelar
            </button>
          </div>
        )}

        {ag.status === "confirmado" && ag.em_atendimento && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              className={`${styles.btn} ${styles["btn--primary"]}`}
              onClick={() => setPagando(true)}
            >
              <Icon name="check" size={15} /> Concluir
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles["btn--danger"]}`}
              onClick={() => dispatch({ type: "CANCELAR", agId: ag.id })}
            >
              Cancelar
            </button>
          </div>
        )}

        {ag.status === "concluido" && cliente && (
          <p className={styles.ficha__meta}>
            {`${cliente.total_visitas}ª visita`}
            {desde(cliente.ultima_visita) &&
              desde(cliente.ultima_visita) !== "hoje" &&
              ` · ${desde(cliente.ultima_visita)}`}
          </p>
        )}

      </article>

      {pagando && (
        <PagamentoDrawer
          valorSugerido={servico?.preco ?? 0}
          cortesiaIdInicial={ag.cortesia_id}
          onConfirmar={confirmarPagamento}
          onClose={() => setPagando(false)}
        />
      )}

      {verPerfil && (
        <PerfilClienteDrawer
          clienteId={ag.cliente_id}
          onClose={() => setVerPerfil(false)}
        />
      )}
    </div>
  );
}
