"use client";
import { escolherPerfil } from "./acoes.dev";

// Sem estilo: ferramenta de desenvolvimento.
export function BotaoPerfil({ id, rotulo }: { id: string; rotulo: string }) {
  return (
    <button type="button" aria-label={`Entrar como ${rotulo}`} onClick={() => void escolherPerfil({ id })}>
      {rotulo}
    </button>
  );
}
