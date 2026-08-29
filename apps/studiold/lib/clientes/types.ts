import type { ResumoCliente } from "./resumo";

export interface PerfilCliente {
  id: string;
  nome: string;
  telefone: string;
  cortesia_favorita_id: string | null;
  estilo_musica_id: string | null;
  observacoes_fixas: string | null;
  resumo: ResumoCliente;
  cortesias_ativas: { id: string; nome: string }[];
  estilos_ativos: { id: string; nome: string }[];
}

export type PerfilResultado =
  | { ok: true; perfil: PerfilCliente }
  | { ok: false; error: string };

export interface PreferenciasPatch {
  cortesiaFavoritaId: string | null;
  estiloMusicaId: string | null;
  observacoesFixas: string | null;
}
