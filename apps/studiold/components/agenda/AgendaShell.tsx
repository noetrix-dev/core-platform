"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AgendaProvider, useAgenda } from "@/lib/agenda/store";
import { buildTimeline, type ItemFicha } from "@/lib/agenda/timeline";
import {
  DIAS_SEMANA_LONGO,
  fmtDataLonga,
  minToHm,
  parseYmd,
  ymd,
} from "@/lib/agenda/time";
import type { AgendaData } from "@/lib/agenda/types";
import { Ficha } from "./Ficha";
import { HeroFicha } from "./HeroFicha";
import { ExceptionTray } from "./ExceptionTray";
import { AgendarDrawer } from "./AgendarDrawer";
import { BloquearDrawer } from "./BloquearDrawer";
import { Icon } from "./Icon";
import styles from "@/app/agenda/agenda.module.css";

const DEMO_NOW_MIN = 770; // 12:50 — mantém "no espelho" povoado em dia passado/futuro

/** dayKey e data vêm do RSC (app/agenda/page.tsx). A navegação de dia troca a
 *  URL (?d=) e deixa o servidor recarregar. */
export function AgendaShell({
  dayKey,
  data,
  waOverride,
}: {
  dayKey: string;
  data: AgendaData;
  waOverride?: string;
}) {
  const router = useRouter();
  const hojeKey = ymd(new Date());

  const irPara = (novoDayKey: string) => {
    const qs = new URLSearchParams();
    if (novoDayKey !== hojeKey) qs.set("d", novoDayKey);
    if (waOverride) qs.set("wa", waOverride);
    router.push(qs.toString() ? `/agenda?${qs}` : "/agenda");
  };
  const passo = (dias: number) => {
    const d = parseYmd(dayKey);
    d.setDate(d.getDate() + dias);
    irPara(ymd(d));
  };

  return (
    <AgendaProvider dayKey={dayKey} data={data}>
      <AgendaScreen
        onPrev={() => passo(-1)}
        onNext={() => passo(1)}
        onHoje={() => irPara(hojeKey)}
        ehHoje={dayKey === hojeKey}
        waOverride={waOverride}
      />
    </AgendaProvider>
  );
}

function AgendaScreen({
  onPrev,
  onNext,
  onHoje,
  ehHoje,
  waOverride,
}: {
  onPrev: () => void;
  onNext: () => void;
  onHoje: () => void;
  ehHoje: boolean;
  waOverride?: string;
}) {
  const { state } = useAgenda();
  const { data, dayKey, aviso } = state;
  const [drawer, setDrawer] = useState<null | "walkin" | "agenda" | "bloq">(null);

  const waStatus =
    waOverride === "caindo" || waOverride === "desconectado"
      ? waOverride
      : data.tenant.whatsapp_status;

  const realMin = useMemo(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }, []);

  const { itens, janela } = useMemo(() => {
    const nowMin =
      ehHoje && realMin >= janelaAbre(state) && realMin <= janelaFecha(state)
        ? realMin
        : DEMO_NOW_MIN;
    return buildTimeline(data, dayKey, janelaDoDiaAberto(data, dayKey) ? nowMin : null);
  }, [data, dayKey, ehHoje, realMin, state]);

  const agoraMin =
    itens.find((i) => i.kind === "agora")?.inicioMin ?? DEMO_NOW_MIN;

  // ficha "no espelho": quem está na cadeira, senão quem contém o agora,
  // senão a próxima ficha ativa.
  const heroId = useMemo(() => {
    const fichas = itens.filter((i): i is ItemFicha => i.kind === "ficha");
    const naCadeira = fichas.find((f) => f.agendamento.em_atendimento);
    if (naCadeira) return naCadeira.key;
    const contem = fichas.find(
      (f) =>
        agoraMin >= f.inicioMin &&
        agoraMin < f.fimMin &&
        f.agendamento.status !== "concluido" &&
        f.agendamento.status !== "nao_compareceu",
    );
    if (contem) return contem.key;
    const prox = fichas.find(
      (f) =>
        f.inicioMin >= agoraMin &&
        (f.agendamento.status === "confirmado" ||
          f.agendamento.status === "pendente"),
    );
    return prox?.key ?? null;
  }, [itens, agoraMin]);

  const dow = parseYmd(dayKey).getDay();
  const aberto = janela.aberto;

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático, sem otimização do next/image */}
          <img src="/studiold-logo.svg" alt="StudiOLD" className="h-8 w-auto" />
          <span className="hidden text-xs uppercase tracking-widest opacity-50 sm:inline">
            Agenda
          </span>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              className={styles.navbtn}
              onClick={onPrev}
              aria-label="Dia anterior"
            >
              <Icon name="prev" size={16} />
            </button>
            <button
              type="button"
              className={`${styles.navbtn} px-2 py-1 text-xs uppercase tracking-wider`}
              onClick={onHoje}
              disabled={ehHoje}
              aria-label="Ir para hoje"
            >
              Hoje
            </button>
            <button
              type="button"
              className={styles.navbtn}
              onClick={onNext}
              aria-label="Próximo dia"
            >
              <Icon name="next" size={16} />
            </button>
          </div>

          <span
            className={styles.pip}
            title={`WhatsApp ${waStatus}`}
            aria-label={`WhatsApp ${waStatus}`}
          >
            <span className={styles.pipDot} data-s={waStatus} />
            <span className="hidden sm:inline">WhatsApp</span>
          </span>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-3 sm:px-6">
          <h1 className={`${styles.daylabel} text-lg font-semibold`}>
            {fmtDataLonga(dayKey)}
          </h1>
        </div>
      </header>

      {waStatus !== "conectado" && (
        <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
          <p className={styles.banner} data-s={waStatus} role="status">
            <Icon name="chat" size={16} />
            {waStatus === "caindo"
              ? "Conexão do WhatsApp instável — mensagens podem atrasar."
              : "WhatsApp desconectado — a fila e os encaixes não estão avisando ninguém."}
          </p>
        </div>
      )}

      <main className="mx-auto grid max-w-6xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* PILHA DO DIA */}
        <section aria-label="Agenda do dia">
          {!aberto ? (
            <div className={`${styles.bloqueio}`} data-tipo="rigido" style={{ minHeight: "8rem", padding: "1.5rem" }}>
              StudiOLD fechada — {DIAS_SEMANA_LONGO[dow]}
            </div>
          ) : (
            <div className={`${styles.lane} flex flex-col gap-2.5`}>
              {itens.map((it) => {
                if (it.kind === "agora") {
                  return (
                    <div key={it.key} className={styles.nowbar} aria-label={`Agora, ${minToHm(it.inicioMin)}`}>
                      <span className={styles.nowbar__time}>{minToHm(it.inicioMin)}</span>
                      <span className={styles.nowbar__rule} />
                    </div>
                  );
                }
                if (it.kind === "fim") {
                  return (
                    <div key={it.key} className={styles.row}>
                      <div className={styles.gutter}>
                        <span className={styles.tnum}>{minToHm(it.inicioMin)}</span>
                      </div>
                      <p className="py-1 text-xs uppercase tracking-widest" style={{ color: "var(--muted)" }}>
                        Fim do expediente
                      </p>
                    </div>
                  );
                }
                if (it.kind === "bloqueio") {
                  return (
                    <div key={it.key} className={styles.row}>
                      <div className={styles.gutter}>
                        <span className={styles.tnum}>{minToHm(it.inicioMin)}</span>
                        <small className={styles.tnum}>
                          {it.fimMin - it.inicioMin} min
                        </small>
                      </div>
                      <div
                        className={styles.bloqueio}
                        data-tipo={it.tipo}
                        style={{ minHeight: "2.5rem" }}
                      >
                        {it.descricao}
                        {it.tipo === "suave" && " · encaixe permitido"}
                      </div>
                    </div>
                  );
                }
                if (it.kind === "vao") {
                  return (
                    <div key={it.key} className={styles.row}>
                      <div className={styles.gutter}>
                        <span className={styles.tnum}>{minToHm(it.inicioMin)}</span>
                        <small className={styles.tnum}>
                          {it.fimMin - it.inicioMin} min livre
                        </small>
                      </div>
                      <button
                        type="button"
                        className={styles.vao}
                        style={{ minHeight: vaoAltura(it.fimMin - it.inicioMin) }}
                        onClick={() => setDrawer("agenda")}
                        aria-label={`Encaixar em ${minToHm(it.inicioMin)}, ${it.fimMin - it.inicioMin} minutos livres`}
                      >
                        <Icon name="plus" size={14} /> encaixar
                      </button>
                    </div>
                  );
                }
                // ficha
                return it.key === heroId ? (
                  <div key={it.key} className={styles.row}>
                    <div className={styles.gutter}>
                      <span className={styles.tnum}>{minToHm(it.inicioMin)}</span>
                      <small className={styles.tnum}>{it.agendamento.duracao_minutos} min</small>
                    </div>
                    <HeroFicha item={it} agoraLabel={minToHm(agoraMin)} />
                  </div>
                ) : (
                  <Ficha key={it.key} item={it} />
                );
              })}
            </div>
          )}
        </section>

        {/* MOLDURA DE EXCEÇÕES + BANCADA */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <ExceptionTray />
          <div className={`${styles.dock} flex flex-col gap-2 p-3`}>
            <button
              type="button"
              className={`${styles.btn} ${styles["btn--primary"]} justify-center`}
              onClick={() => setDrawer("walkin")}
            >
              <Icon name="user" size={15} /> Walk-in
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                className={`${styles.btn} ${styles["btn--ghost"]} flex-1 justify-center`}
                onClick={() => setDrawer("agenda")}
              >
                <Icon name="plus" size={15} /> Agendar
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles["btn--ghost"]} flex-1 justify-center`}
                onClick={() => setDrawer("bloq")}
              >
                <Icon name="lock" size={15} /> Bloquear
              </button>
            </div>
          </div>
        </aside>
      </main>

      {aviso && (
        <div className={styles.toast} role="status" aria-live="polite">
          <Icon name="bell" size={16} />
          {aviso}
        </div>
      )}

      {drawer === "walkin" && (
        <AgendarDrawer modo="walkin" onClose={() => setDrawer(null)} />
      )}
      {drawer === "agenda" && (
        <AgendarDrawer modo="agenda" onClose={() => setDrawer(null)} />
      )}
      {drawer === "bloq" && <BloquearDrawer onClose={() => setDrawer(null)} />}
    </div>
  );
}

function vaoAltura(min: number): string {
  return `${Math.max(2.75, Math.min(6, min * 0.06))}rem`;
}

// helpers de janela — evitam recomputar em três lugares
function janelaDoDiaAberto(data: Parameters<typeof buildTimeline>[0], dayKey: string) {
  const dow = parseYmd(dayKey).getDay();
  const h = data.horarios.find((x) => x.dia_semana === dow);
  return !!(h && h.aberto);
}
function janelaAbre(state: ReturnType<typeof useAgenda>["state"]) {
  const dow = parseYmd(state.dayKey).getDay();
  const h = state.data.horarios.find((x) => x.dia_semana === dow);
  return h?.hora_abertura ? Number(h.hora_abertura.slice(0, 2)) * 60 : 540;
}
function janelaFecha(state: ReturnType<typeof useAgenda>["state"]) {
  const dow = parseYmd(state.dayKey).getDay();
  const h = state.data.horarios.find((x) => x.dia_semana === dow);
  return h?.hora_fechamento ? Number(h.hora_fechamento.slice(0, 2)) * 60 : 1020;
}
