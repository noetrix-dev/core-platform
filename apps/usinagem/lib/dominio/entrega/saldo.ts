import { ehQuantidadeValida, falha, ok, type Resultado } from "../comum";

export type EventoEntrega = { chave: string; tipo: "expedido" | "aceito" | "recusado" | "devolvido"; quantidade: number };
export type SituacaoEntrega = "nao_programada" | "programada" | "parcialmente_entregue" | "entregue";
export type PosicaoEntrega = {
  contratado: number; programado: number; expedido: number; aceitoLiquido: number;
  recusado: number; devolvido: number; saldo: number; situacao: SituacaoEntrega;
};

export function posicaoEntrega(contratado: number, programado: number, eventos: EventoEntrega[]): PosicaoEntrega {
  const inteiroNaoNegativo = (n: number) => n === 0 || ehQuantidadeValida(n);
  if (!inteiroNaoNegativo(contratado) || !inteiroNaoNegativo(programado)) throw new Error("Posição de entrega inválida.");
  const soma = { expedido: 0, aceito: 0, recusado: 0, devolvido: 0 };
  const vistos = new Map<string, EventoEntrega>();
  for (const e of eventos) {
    if (!Object.hasOwn(soma, e.tipo) || !ehQuantidadeValida(e.quantidade)) throw new Error("Evento de entrega inválido.");
    const anterior = vistos.get(e.chave);
    if (anterior) {
      if (anterior.tipo !== e.tipo || anterior.quantidade !== e.quantidade) {
        throw new Error("Evento de entrega repetido com conteúdo diferente.");
      }
      continue;
    }
    vistos.set(e.chave, e);
    soma[e.tipo] += e.quantidade;
  }
  // total acumulado, não ordem dos eventos
  if (soma.devolvido > soma.aceito) throw new Error("Devolução maior que o aceito.");
  const aceitoLiquido = soma.aceito - soma.devolvido;
  const situacao: SituacaoEntrega =
    contratado > 0 && aceitoLiquido >= contratado ? "entregue"
    : aceitoLiquido > 0 ? "parcialmente_entregue"
    : programado > 0 ? "programada"
    : "nao_programada";
  return {
    contratado, programado, expedido: soma.expedido, aceitoLiquido,
    recusado: soma.recusado, devolvido: soma.devolvido, saldo: contratado - aceitoLiquido, situacao,
  };
}

export function validarAceite(p: PosicaoEntrega, quantidade: number): Resultado<true> {
  if (!ehQuantidadeValida(quantidade)) return falha("Quantidade aceita precisa ser inteira e positiva.");
  if (quantidade > p.saldo) return falha("Aceite acima do saldo contratado exige aditivo formal.");
  return ok(true);
}
