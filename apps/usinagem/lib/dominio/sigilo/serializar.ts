import { falha, ok, type Resultado } from "../comum";
import type { EventoAuditoria, ItemRevisao, TituloPagar, TituloReceber } from "../contratos";
import { pode } from "../permissoes/catalogo";
import type { Perfil } from "../permissoes/perfis";
import { CONTEXTO_DA_ENTIDADE, podeVerCampo, type Contexto } from "./campos";

// O campo proibido não sai do servidor. Esconder na tela não basta (spec §7.3).

export function serializar<T extends object>(registro: T, perfil: Perfil, contexto: Contexto): Partial<T> {
  return Object.fromEntries(Object.entries(registro).filter(([campo]) => podeVerCampo(perfil, contexto, campo))) as Partial<T>;
}

export const serializarItemRevisao = (item: ItemRevisao, perfil: Perfil) => serializar(item, perfil, "item_revisao");

export const serializarTituloPagar = (t: TituloPagar, perfil: Perfil) =>
  pode(perfil, "titulo_pagar.operar") ? serializar(t, perfil, "titulo_pagar") : null;

export const serializarTituloReceber = (t: TituloReceber, perfil: Perfil) =>
  pode(perfil, "titulo_receber.operar") ? serializar(t, perfil, "titulo_receber") : null;

/** Histórico visível a outros perfis sem os valores que eles não podem ver. */
export function serializarEventoAuditoria(ev: EventoAuditoria, perfil: Perfil): EventoAuditoria | null {
  if (perfil === "admin") return ev;
  if (!pode(perfil, "processo.ver")) return null;
  const contexto = CONTEXTO_DA_ENTIDADE[ev.entidade];
  if (!contexto) return { ...ev, antes: null, depois: null };
  const filtrar = (v: Record<string, unknown> | null) => (v ? serializar(v, perfil, contexto) : null);
  return { ...ev, antes: filtrar(ev.antes), depois: filtrar(ev.depois) };
}

/** Uma mensagem só, sem campo nem valor: a recusa não pode revelar o que está oculto. */
export const MENSAGEM_CONSULTA_NEGADA = "Consulta não permitida para o seu perfil.";

export function validarConsulta(
  perfil: Perfil,
  contexto: Contexto,
  q: { ordenarPor?: string; filtros?: string[]; busca?: string[] },
): Resultado<true> {
  const campos = [q.ordenarPor, ...(q.filtros ?? []), ...(q.busca ?? [])].filter((c): c is string => Boolean(c));
  return campos.every((c) => podeVerCampo(perfil, contexto, c)) ? ok(true) : falha(MENSAGEM_CONSULTA_NEGADA);
}

/** Agregado sobre campo oculto é recusado em qualquer tamanho de grupo, inclusive grupo de um item. */
export function validarAgregado(
  perfil: Perfil,
  contexto: Contexto,
  a: { campo: string; agruparPor?: string[] },
): Resultado<true> {
  const campos = [a.campo, ...(a.agruparPor ?? [])];
  return campos.every((c) => podeVerCampo(perfil, contexto, c)) ? ok(true) : falha(MENSAGEM_CONSULTA_NEGADA);
}

/** Exportação usa o mesmo serializador. `dados.exportar` é travada no Admin. */
export function exportarLinhas<T extends object>(linhas: T[], perfil: Perfil, contexto: Contexto): Partial<T>[] | null {
  if (!pode(perfil, "dados.exportar")) return null;
  return linhas.map((l) => serializar(l, perfil, contexto));
}
