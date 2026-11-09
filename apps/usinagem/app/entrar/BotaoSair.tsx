"use client";
import { sair } from "./acoes";

// Sem estilo: o shell autenticado (com o lugar definitivo do Sair) vem na 1C.
export function BotaoSair() {
  return (
    <button type="button" onClick={() => void sair({})}>
      Sair
    </button>
  );
}
