export type VinculoDemanda = { pedidoItemId: string; quantidade: number };

/** Vínculo demanda-pedido: cada item de pedido conta uma vez; o último registro (aditivo) vale. */
export function posicaoDemanda(demanda: number, vinculos: VinculoDemanda[]) {
  const porItem = new Map<string, number>();
  for (const v of vinculos) porItem.set(v.pedidoItemId, v.quantidade);
  const formalizado = [...porItem.values()].reduce((s, q) => s + q, 0);
  return {
    demanda,
    formalizado,
    naoFormalizado: Math.max(0, demanda - formalizado),
    acimaDaDemanda: Math.max(0, formalizado - demanda),
  };
}
