"use client";

import { useActionState } from "react";
import { entrar, type EntrarEstado } from "./actions";

const INICIAL: EntrarEstado = { erro: null };

export function LoginForm() {
  const [estado, acao, pendente] = useActionState(entrar, INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          required
          autoFocus
          className="border px-3 py-2"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="senha">Senha</label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className="border px-3 py-2"
        />
      </div>

      {estado.erro && (
        <p role="alert" className="text-sm text-red-700">
          {estado.erro}
        </p>
      )}

      <button
        type="submit"
        className="border px-4 py-2 font-semibold"
        disabled={pendente}
      >
        {pendente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
