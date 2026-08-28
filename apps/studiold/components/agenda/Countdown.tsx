"use client";

import { useEffect, useState } from "react";
import { contagemRegressiva } from "@/lib/agenda/time";
import styles from "@/app/agenda/agenda.module.css";

export function Countdown({ expiraEm }: { expiraEm?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const { texto, segundos } = contagemRegressiva(expiraEm, now);
  const urg = segundos <= 60 ? "agora" : segundos <= 300 ? "perto" : "ok";

  return (
    <span
      className={`${styles.countdown} ${styles.tnum}`}
      data-urg={urg}
      aria-label={`Expira em ${texto}`}
    >
      {texto}
    </span>
  );
}
