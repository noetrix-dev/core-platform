import { falha, ok, type Resultado } from "../comum";
import type { EventoAuditoria, ItemRevisao, TituloPagar, TituloReceber } from "../contratos";
import { pode, type Permissao } from "../permissoes/catalogo";
import type { Perfil } from "../permissoes/perfis";
import { CONTEXTO_DA_ENTIDADE, podeLerContexto, podeVerCampo, type Contexto } from "./campos";

// O campo proibido não sai do servidor. Esconder na tela não basta (spec §7.3).

const primitivo = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);

/** null = 403. Admin recebe cópia rasa; os demais só campos permitidos e primitivos (aninhado cai, falha fechado). */
export function serializar<T extends object>(registro: T, perfil: Perfil, contexto: Contexto, concedidas?: readonly Permissao[]): Partial<T> | null {
  if (!podeLerContexto(perfil, contexto, concedidas)) return null;
  if (perfil === "admin") return { ...registro };
  return Object.fromEntries(
    Object.entries(registro).filter(([campo, v]) => podeVerCampo(perfil, contexto, campo, concedidas) && primitivo(v)),
  ) as Partial<T>;
}

export const serializarItemRevisao = (item: ItemRevisao, perfil: Perfil, concedidas?: readonly Permissao[]) => serializar(item, perfil, "item_revisao", concedidas);

export const serializarTituloPagar = (t: TituloPagar, perfil: Perfil, concedidas?: readonly Permissao[]) => serializar(t, perfil, "titulo_pagar", concedidas);

export const serializarTituloReceber = (t: TituloReceber, perfil: Perfil, concedidas?: readonly Permissao[]) => serializar(t, perfil, "titulo_receber", concedidas);

/** Histórico visível a outros perfis sem os valores que eles não podem ver. */
export function serializarEventoAuditoria(ev: EventoAuditoria, perfil: Perfil, concedidas?: readonly Permissao[]): EventoAuditoria | null {
  if (perfil === "admin") return ev;
  if (!pode(perfil, "processo.ver", concedidas)) return null;
  const contexto = Object.hasOwn(CONTEXTO_DA_ENTIDADE, ev.entidade) ? CONTEXTO_DA_ENTIDADE[ev.entidade] : undefined;
  if (!contexto) return { ...ev, antes: null, depois: null };
  if (!podeLerContexto(perfil, contexto, concedidas)) return null;
  const filtrar = (v: Record<string, unknown> | null) => (v ? serializar(v, perfil, contexto, concedidas) : null);
  return { ...ev, antes: filtrar(ev.antes), depois: filtrar(ev.depois) };
}

/** Uma mensagem só, sem campo nem valor: a recusa não pode revelar o que está oculto. */
export const MENSAGEM_CONSULTA_NEGADA = "Consulta não permitida para o seu perfil.";

type Nomes = { ordenarPor?: string; filtros?: string[]; busca?: string[] };

function nomesPermitidos(perfil: Perfil, contexto: Contexto, nomes: unknown[], concedidas?: readonly Permissao[]): Resultado<true> {
  if (!podeLerContexto(perfil, contexto, concedidas)) return falha(MENSAGEM_CONSULTA_NEGADA);
  const bom = nomes.every((c) => typeof c === "string" && c !== "" && podeVerCampo(perfil, contexto, c, concedidas));
  return bom ? ok(true) : falha(MENSAGEM_CONSULTA_NEGADA);
}

const informados = (q: Nomes) => [...(q.ordenarPor === undefined ? [] : [q.ordenarPor]), ...(q.filtros ?? []), ...(q.busca ?? [])];

export const validarConsulta = (perfil: Perfil, contexto: Contexto, q: Nomes, concedidas?: readonly Permissao[]): Resultado<true> =>
  nomesPermitidos(perfil, contexto, informados(q), concedidas);

/** Agregado sobre campo oculto é recusado em qualquer tamanho de grupo; filtro e busca oculta viram oráculo, então valem igual. */
export const validarAgregado = (
  perfil: Perfil,
  contexto: Contexto,
  a: { campo: string; agruparPor?: string[]; filtros?: string[]; busca?: string[] },
  concedidas?: readonly Permissao[],
): Resultado<true> => nomesPermitidos(perfil, contexto, [a.campo, ...(a.agruparPor ?? []), ...(a.filtros ?? []), ...(a.busca ?? [])], concedidas);

/** Exportação usa o mesmo serializador. `dados.exportar` é travada no Admin. */
export function exportarLinhas<T extends object>(linhas: T[], perfil: Perfil, contexto: Contexto, concedidas?: readonly Permissao[]): Partial<T>[] | null {
  if (!pode(perfil, "dados.exportar", concedidas) || !podeLerContexto(perfil, contexto, concedidas)) return null;
  return linhas.map((l) => serializar(l, perfil, contexto, concedidas)!);
}
