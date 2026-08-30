"use client";

// Estoque do produto editável inline (mesmo padrão de EstoqueEditavel das
// cortesias). Grava a quantidade absoluta.

import { useRef, useState, useTransition } from "react";
import { definirProdutoEstoque } from "./actions";
import styles from "@/app/agenda/agenda.module.css";

export function EstoqueProdutoEditavel({
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
      definirProdutoEstoque(id, v);
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
