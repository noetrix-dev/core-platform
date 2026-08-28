"use client";

// Estoque da cortesia editável inline: clique no número → input com o valor
// atual → salva no blur ou Enter (Esc cancela). Grava a quantidade absoluta.

import { useRef, useState, useTransition } from "react";
import { definirEstoque } from "./actions";
import styles from "@/app/agenda/agenda.module.css";

export function EstoqueEditavel({
  id,
  valor,
  nome,
}: {
  id: string;
  valor: number;
  nome: string;
}) {
  const [editando, setEditando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const ref = useRef<HTMLInputElement>(null);

  function salvar() {
    const v = Number(ref.current?.value);
    setEditando(false);
    if (!Number.isInteger(v) || v < 0 || v === valor) return;
    iniciar(() => {
      definirEstoque(id, v);
    });
  }

  if (!editando) {
    return (
      <button
        type="button"
        className={styles.cfgEstoqueNum}
        onClick={() => setEditando(true)}
        disabled={pendente}
        aria-label={`Editar estoque de ${nome}, atual ${valor}`}
      >
        {pendente ? "…" : valor}
      </button>
    );
  }

  return (
    <input
      ref={ref}
      type="number"
      min={0}
      max={99999}
      defaultValue={valor}
      autoFocus
      className={styles.cfgEstoqueEdit}
      aria-label={`Estoque de ${nome}`}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={salvar}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setEditando(false);
        }
      }}
    />
  );
}
