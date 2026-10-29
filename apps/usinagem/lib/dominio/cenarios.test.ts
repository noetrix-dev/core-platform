import { describe, expect, it } from "vitest";
import type { Resultado } from "./comum";
import { posicaoDemanda } from "./demanda/demanda";
import { posicaoEntrega, type EventoEntrega } from "./entrega/saldo";
import { entradaProducao, expedir, liberarLote, posicaoEstoque, reservar, type EstadoEstoque } from "./estoque/estoque";

const valor = <T>(r: Resultado<T>): T => {
  if (!r.ok) throw new Error(r.erro);
  return r.valor;
};
const vazio: EstadoEstoque = { lotes: [], movimentos: [], reservas: [] };
const lote = { id: "L1", produtoId: "polia", revisaoTecnicaId: "revA", situacao: "aguardando_inspecao" as const };
const aceite = (chave: string, quantidade: number): EventoEntrega => ({ chave, tipo: "aceito", quantidade });
const expedicao = (chave: string, quantidade: number): EventoEntrega => ({ chave, tipo: "expedido", quantidade });

describe("Cenário 1: pedido 20, entregas 5 + 5 + 10", () => {
  it("saldo só cai com aceite; entregue após 20 aceitas", () => {
    const ev: EventoEntrega[] = [expedicao("r1", 5)];
    expect(posicaoEntrega(20, 20, ev).saldo).toBe(20);
    ev.push(aceite("a1", 5));
    expect(posicaoEntrega(20, 20, ev)).toMatchObject({ saldo: 15, situacao: "parcialmente_entregue" });
    ev.push(expedicao("r2", 5), aceite("a2", 5), expedicao("r3", 10));
    expect(posicaoEntrega(20, 20, ev).saldo).toBe(10);
    ev.push(aceite("a3", 10));
    expect(posicaoEntrega(20, 20, ev)).toMatchObject({ saldo: 0, aceitoLiquido: 20, situacao: "entregue" });
  });

  it("borda: reenvio da chave a1 não muda o saldo; expedição sem aceite mantém o saldo", () => {
    const ev: EventoEntrega[] = [expedicao("r1", 5), aceite("a1", 5)];
    expect(posicaoEntrega(20, 20, ev).saldo).toBe(15);
    ev.push(aceite("a1", 5)); // replay idêntico
    expect(posicaoEntrega(20, 20, ev)).toMatchObject({ saldo: 15, aceitoLiquido: 5 });
    ev.push(expedicao("r2", 5)); // expedido, ainda sem aceite
    expect(posicaoEntrega(20, 20, ev)).toMatchObject({ saldo: 15, aceitoLiquido: 5, expedido: 10 });
    ev.push(aceite("a2", 5), expedicao("r3", 10));
    expect(posicaoEntrega(20, 20, ev)).toMatchObject({ saldo: 10, aceitoLiquido: 10, expedido: 20 });
    ev.push(aceite("a2", 5)); // replay de a2
    expect(posicaoEntrega(20, 20, ev).saldo).toBe(10);
  });
});

describe("Cenário 2: pedido 20, entrega única de 20", () => {
  it("20 aceitas, saldo 0", () => {
    expect(posicaoEntrega(20, 20, [expedicao("r1", 20), aceite("a1", 20)])).toMatchObject({ saldo: 0, situacao: "entregue" });
  });
});

describe("Cenário 3: demanda 20, pedido formal 5", () => {
  it("5 contratadas, 15 só previstas; pedidos 5 + 10 zeram a previsão sem duplicar", () => {
    expect(posicaoDemanda(20, [{ pedidoItemId: "p1", quantidade: 5 }])).toMatchObject({ formalizado: 5, naoFormalizado: 15 });
    const r = posicaoDemanda(20, [
      { pedidoItemId: "p1", quantidade: 5 },
      { pedidoItemId: "p2", quantidade: 5 },
      { pedidoItemId: "p3", quantidade: 10 },
      { pedidoItemId: "p2", quantidade: 5 },
    ]);
    expect(r).toMatchObject({ formalizado: 20, naoFormalizado: 0 });
  });

  it("borda: um quarto pedido de 5 acima dos 20 dá formalizado 25, previsão 0 e acimaDaDemanda 5", () => {
    const r = posicaoDemanda(20, [
      { pedidoItemId: "p1", quantidade: 5 },
      { pedidoItemId: "p2", quantidade: 5 },
      { pedidoItemId: "p3", quantidade: 10 },
      { pedidoItemId: "p4", quantidade: 5 },
    ]);
    expect(r).toMatchObject({ formalizado: 25, naoFormalizado: 0, acimaDaDemanda: 5 });
  });
});

describe("Cenário 4: produção acima do pedido", () => {
  const produzir40 = (alocadoAoPedido: number) => {
    const e = valor(entradaProducao(vazio, { chave: "op1", lote, quantidade: 40 }));
    return valor(liberarLote(e, "L1", [{ reservaId: "F1", clienteId: "C1", pedidoItemId: "PI1", quantidade: alocadoAoPedido }]));
  };

  it("pedido 20, produz 40, entrega 20: físico 20, sem receita extra; Admin escolhe livre ou reservado", () => {
    const e = valor(expedir(produzir40(20), { chave: "rem1", reservaId: "F1", quantidade: 20 }));
    expect(posicaoEstoque(e, "polia", "revA")).toMatchObject({ fisicoTotal: 20, reservasFirmes: 0, livre: 20 });
    const reservado = valor(reservar(e, { id: "E1", loteId: "L1", tipo: "estrategica", clienteId: "C1", pedidoItemId: null, quantidade: 20 }));
    expect(posicaoEstoque(reservado, "polia", "revA")).toMatchObject({ reservasEstrategicas: 20, livre: 0 });
    expect(posicaoDemanda(20, [{ pedidoItemId: "PI1", quantidade: 20 }]).formalizado).toBe(20);
  });

  it("combinado: demanda 20, pedido 5, produz 40, entrega 5, reserva 15, livre 20", () => {
    let e = valor(expedir(produzir40(5), { chave: "rem1", reservaId: "F1", quantidade: 5 }));
    e = valor(reservar(e, { id: "E1", loteId: "L1", tipo: "estrategica", clienteId: "C1", pedidoItemId: null, quantidade: 15 }));
    expect(posicaoEstoque(e, "polia", "revA")).toEqual({
      fisicoTotal: 35, fisicoElegivel: 35, reservasFirmes: 0, reservasEstrategicas: 15, livre: 20, deficitBloqueio: 0,
    });
    expect(posicaoDemanda(20, [{ pedidoItemId: "PI1", quantidade: 5 }])).toMatchObject({ formalizado: 5, naoFormalizado: 15 });
    expect(posicaoEntrega(5, 5, [aceite("a1", 5)]).situacao).toBe("entregue");
  });

  it("variações: reservar as 35 dá livre 0; nenhuma reserva dá livre 35", () => {
    const e = valor(expedir(produzir40(5), { chave: "rem1", reservaId: "F1", quantidade: 5 }));
    expect(posicaoEstoque(e, "polia", "revA").livre).toBe(35);
    const tudo = valor(reservar(e, { id: "E1", loteId: "L1", tipo: "estrategica", clienteId: "C1", pedidoItemId: null, quantidade: 35 }));
    expect(posicaoEstoque(tudo, "polia", "revA").livre).toBe(0);
  });

  it("borda: estratégica restante não passa do livre (21 após os 15 é recusado; 20 cabe) e rem1 repetido não muda o estado", () => {
    let e = valor(expedir(produzir40(5), { chave: "rem1", reservaId: "F1", quantidade: 5 }));
    e = valor(reservar(e, { id: "E1", loteId: "L1", tipo: "estrategica", clienteId: "C1", pedidoItemId: null, quantidade: 15 }));
    // livre = 35 - 15 = 20
    const demais = reservar(e, { id: "E2", loteId: "L1", tipo: "estrategica", clienteId: "C1", pedidoItemId: null, quantidade: 21 });
    expect(demais.ok).toBe(false);
    const exato = valor(reservar(e, { id: "E2", loteId: "L1", tipo: "estrategica", clienteId: "C1", pedidoItemId: null, quantidade: 20 }));
    expect(posicaoEstoque(exato, "polia", "revA")).toMatchObject({ reservasEstrategicas: 35, livre: 0 });

    const replay = expedir(e, { chave: "rem1", reservaId: "F1", quantidade: 5 });
    expect(replay.ok).toBe(true);
    expect(valor(replay)).toEqual(e);
    expect(posicaoEstoque(valor(replay), "polia", "revA")).toMatchObject({ fisicoTotal: 35, livre: 20 });
  });
});
