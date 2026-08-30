"use client";

import { useActionState } from "react";
import { entrar, type EntrarEstado } from "./actions";
import styles from "@/app/agenda/agenda.module.css";

const INICIAL: EntrarEstado = { erro: null };

export function LoginForm() {
  const [estado, acao, pendente] = useActionState(entrar, INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-4">
      <div className={`${styles.field} flex flex-col gap-1.5`}>
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          required
          autoFocus
        />
      </div>
      <div className={`${styles.field} flex flex-col gap-1.5`}>
        <label htmlFor="senha">Senha</label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {estado.erro && (
        <p role="alert" className={styles.msgQuiet} data-tom="erro">
          {estado.erro}
        </p>
      )}

      <button
        type="submit"
        className={`${styles.btn} ${styles["btn--primary"]} justify-center`}
        disabled={pendente}
      >
        {pendente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
