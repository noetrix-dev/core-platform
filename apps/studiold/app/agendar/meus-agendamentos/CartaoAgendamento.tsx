"use client";

// Cartão de um agendamento futuro: Remarcar (link pro wizard) e Cancelar com
// confirmação inline — sem modal, sem confirm() do navegador.
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rotuloDia, rotuloStatus, type ItemAgendamento } from "@/lib/agendar/formato";
import { fmtPreco } from "@/lib/agenda/time";
import { cancelarAgendamento, type FalhaAgendar } from "../actions";
import styles from "@/app/agenda/agenda.module.css";
import css from "../agendar.module.css";

const FALHA_CONEXAO: FalhaAgendar = { ok: false, error: "Falha de conexão. Tente de novo." };

export function CartaoAgendamento({ agendamento: a }: { agendamento: ItemAgendamento }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const manterRef = useRef<HTMLButtonElement>(null);
  const cancelarRef = useRef<HTMLButtonElement>(null);
  const abriu = useRef(false);

  // Foco na escolha segura ao abrir; ao fechar (Manter, Esc, erro), volta pro "Cancelar".
  useEffect(() => {
    if (confirmando) {
      abriu.current = true;
      manterRef.current?.focus();
    } else if (abriu.current) {
      cancelarRef.current?.focus();
    }
  }, [confirmando]);

  function cancelar() {
    setErro(null);
    iniciar(async () => {
      const r = await cancelarAgendamento(a.id).catch(() => FALHA_CONEXAO);
      if (r.ok) {
        router.refresh();
        return;
      }
      if (r.sessaoExpirada) {
        router.push("/agendar?destino=meus-agendamentos");
        return;
      }
      setConfirmando(false);
      setErro(r.error);
      if (r.error.startsWith("Esse agendamento já não pode ser cancelado")) router.refresh();
    });
  }

  const quando = `${rotuloDia(a.data)} às ${a.hora}`;

  return (
    <article className={css.comanda} aria-label={quando}>
      <div className={css.cartaoTopo}>
        <p className={css.comandaDestaque}>{quando}</p>
        <span className={css.selo} data-status={a.status}>
          {rotuloStatus(a.status)}
        </span>
      </div>
      {a.servicos.map((s, i) => (
        <div key={`${s}-${i}`} className={css.comandaLinha}>
          <span>{s}</span>
        </div>
      ))}
      <div className={css.comandaTotal}>
        <span>Total</span>
        <span>{fmtPreco(a.valorTotal)}</span>
      </div>

      {erro && (
        <p role="alert" className={`${styles.msgQuiet} mt-3`} data-tom="erro">
          {erro}
        </p>
      )}

      {confirmando ? (
        <div
          className={css.confirmaCancelar}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !pendente) setConfirmando(false);
          }}
        >
          <p className={styles.msgQuiet}>Tem certeza? Essa ação não pode ser desfeita.</p>
          <div className={css.acoes}>
            <button
              ref={manterRef}
              type="button"
              className={`${styles.btn} ${css.cta}`}
              disabled={pendente}
              onClick={() => setConfirmando(false)}
            >
              Manter
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles["btn--primary"]} ${css.cta}`}
              disabled={pendente}
              onClick={cancelar}
            >
              {pendente ? "Cancelando…" : "Sim, cancelar"}
            </button>
          </div>
        </div>
      ) : (
        <div className={css.acoes}>
          <Link href={`/agendar?remarcar=${a.id}`} className={`${styles.btn} ${css.cta}`}>
            Remarcar
          </Link>
          <button
            ref={cancelarRef}
            type="button"
            className={`${styles.btn} ${styles["btn--danger"]} ${css.cta}`}
            onClick={() => setConfirmando(true)}
          >
            Cancelar
          </button>
        </div>
      )}
    </article>
  );
}
