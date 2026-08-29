"use client";

// Form da seção de horários: 7 dias + bloqueio de almoço, um botão Salvar.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarHorarios } from "./actions";
import { DIAS_SEMANA_LONGO } from "@/lib/agenda/time";
import { Icon } from "@/components/agenda/Icon";
import styles from "@/app/agenda/agenda.module.css";

type Dia = {
  dia_semana: number;
  aberto: boolean;
  hora_abertura: string;
  hora_fechamento: string;
};
type Almoco = { id: string; hora_inicio: string; hora_fim: string } | null;

export function HorariosForm({
  dias: diasIniciais,
  almoco: almocoInicial,
}: {
  dias: Dia[];
  almoco: Almoco;
}) {
  const router = useRouter();
  const [dias, setDias] = useState(diasIniciais);
  const [almoco, setAlmoco] = useState(almocoInicial);
  const [salvando, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);

  const patchDia = (i: number, p: Partial<Dia>) =>
    setDias((ds) => ds.map((d, j) => (j === i ? { ...d, ...p } : d)));

  const salvar = () => {
    setAviso(null);
    iniciar(async () => {
      const r = await salvarHorarios(dias, almoco).catch(() => ({
        ok: false as const,
        error: "Falha de conexão. Tente de novo.",
      }));
      if (!r.ok) {
        router.refresh();
        setAviso(r.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className={styles.cfgSection}>
      <header>
        <Icon name="clock" size={15} /> Horário de funcionamento
      </header>

      {dias.map((d, i) => (
        <div
          key={d.dia_semana}
          className={styles.cfgHorarioRow}
          data-fechado={d.aberto ? undefined : "true"}
        >
          <span className={styles.cfgHorarioDia}>
            {DIAS_SEMANA_LONGO[d.dia_semana]}
          </span>
          <button
            type="button"
            className={styles.cfgSwitch}
            data-on={d.aberto}
            aria-label={`${d.aberto ? "Fechar" : "Abrir"} ${DIAS_SEMANA_LONGO[d.dia_semana]}`}
            onClick={() => patchDia(i, { aberto: !d.aberto })}
          />
          <div className={styles.cfgHorarioTimes}>
            <input
              type="time"
              step={900}
              value={d.hora_abertura}
              disabled={!d.aberto}
              aria-label={`Abertura de ${DIAS_SEMANA_LONGO[d.dia_semana]}`}
              onChange={(e) => patchDia(i, { hora_abertura: e.target.value })}
            />
            <span>até</span>
            <input
              type="time"
              step={900}
              value={d.hora_fechamento}
              disabled={!d.aberto}
              aria-label={`Fechamento de ${DIAS_SEMANA_LONGO[d.dia_semana]}`}
              onChange={(e) => patchDia(i, { hora_fechamento: e.target.value })}
            />
          </div>
        </div>
      ))}

      <div className={styles.cfgHorarioRow}>
        <span className={styles.cfgHorarioDia}>Almoço</span>
        {almoco ? (
          <div className={styles.cfgHorarioTimes}>
            <input
              type="time"
              step={900}
              value={almoco.hora_inicio}
              aria-label="Início do almoço"
              onChange={(e) =>
                setAlmoco((a) => (a ? { ...a, hora_inicio: e.target.value } : a))
              }
            />
            <span>até</span>
            <input
              type="time"
              step={900}
              value={almoco.hora_fim}
              aria-label="Fim do almoço"
              onChange={(e) =>
                setAlmoco((a) => (a ? { ...a, hora_fim: e.target.value } : a))
              }
            />
          </div>
        ) : (
          <span
            className={styles.cfgHorarioTimes}
            style={{ color: "var(--ink-2)" }}
          >
            Nenhum bloqueio de almoço configurado.
          </span>
        )}
      </div>

      {aviso && (
        <p
          className="px-3.5 pt-3 text-sm"
          style={{ color: "var(--oxblood)" }}
        >
          {aviso}
        </p>
      )}

      <div className={styles.cfgHorarioSalvar}>
        <button
          type="button"
          className={`${styles.btn} ${styles["btn--primary"]} w-full justify-center`}
          disabled={salvando}
          onClick={salvar}
        >
          {salvando ? "Salvando…" : "Salvar horários"}
        </button>
      </div>
    </section>
  );
}
