// Itens do drawer de conclusão. Módulo puro — sem React, sem I/O.

export type ItemPagamento = {
  key: string; // id local estável (para React key e remoção)
  tipo: "servico" | "produto";
  refId: string; // servico_id | produto_id
  descricao: string; // snapshot do nome
  quantidade: number;
  precoUnitario: number;
  fixo: boolean; // true = linha do serviço principal (não removível)
};

/** Soma dos subtotais, cada subtotal arredondado a 2 casas antes de somar. */
export function somaItens(itens: ItemPagamento[]): number {
  const cents = itens.reduce(
    (acc, i) => acc + Math.round(i.quantidade * i.precoUnitario * 100),
    0,
  );
  return cents / 100;
}
