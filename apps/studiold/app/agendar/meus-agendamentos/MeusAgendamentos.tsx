"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { rotuloDia, rotuloStatus, type ItemAgendamento } from "@/lib/agendar/formato";
import { fmtPreco } from "@/lib/agenda/time";
import { AgendarCabecalho } from "../AgendarCabecalho";
import { CartaoAgendamento } from "./CartaoAgendamento";
import styles from "@/app/agenda/agenda.module.css";
import css from "../agendar.module.css";

type Props = {
  nome: string;
  lista: { futuros: ItemAgendamento[]; passados: ItemAgendamento[] } | null; // null = falha ao carregar
};

export function MeusAgendamentos({ nome, lista }: Props) {
  const router = useRouter();

  return (
    <>
      <AgendarCabecalho etapa="Meus agendamentos" onVoltar={() => router.push("/agendar")} />
      <main className={css.corpo}>
        <h1 className={styles.pageTitle}>Olá, {nome}!</h1>
        <Link
          href="/agendar"
          className={`${styles.btn} ${styles["btn--primary"]} ${css.cta} mt-4 w-full`}
        >
          Novo agendamento
        </Link>

        {lista === null ? (
          <div className="mt-6">
            <p role="alert" className={styles.msgQuiet} data-tom="erro">
              Não foi possível carregar seus agendamentos.
            </p>
            <button
              type="button"
              className={`${styles.btn} ${css.cta} mt-3 w-full`}
              onClick={() => router.refresh()}
            >
              Tentar de novo
            </button>
          </div>
        ) : (
          <>
            <section className={css.secao} aria-labelledby="proximos-titulo">
              <h2 id="proximos-titulo" className={css.grupoTitulo}>
                Próximos
              </h2>
              {lista.futuros.length === 0 ? (
                <p className={styles.msgQuiet}>Nenhum horário marcado.</p>
              ) : (
                <div className={css.cartoes}>
                  {lista.futuros.map((a) => (
                    <CartaoAgendamento key={a.id} agendamento={a} />
                  ))}
                </div>
              )}
            </section>

            {lista.passados.length > 0 && (
              <section className={css.secao} aria-labelledby="anteriores-titulo">
                <h2 id="anteriores-titulo" className={css.grupoTitulo}>
                  Anteriores
                </h2>
                <ul className={css.lista}>
                  {lista.passados.map((a) => (
                    <li key={a.id} className={css.anterior}>
                      <div className={css.anteriorTopo}>
                        <span>
                          {rotuloDia(a.data)} · {a.hora}
                        </span>
                        <span className={css.statusTexto} data-status={a.status}>
                          {rotuloStatus(a.status)}
                        </span>
                      </div>
                      <p className={css.linhaMeta}>
                        {a.servicos.join(", ")} · {fmtPreco(a.valorTotal)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
