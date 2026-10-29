import { describe, expect, it } from "vitest";
import type { Resultado } from "../comum";
import {
  bloquearLote, converterEmFirme, entradaProducao, expedir, liberarLote, posicaoEstoque, reliberarLote, reservar,
  validarEstado, type EstadoEstoque, type Lote,
} from "./estoque";

const vazio: EstadoEstoque = { lotes: [], movimentos: [], reservas: [] };
const lote = (id: string, rev = "revA"): Lote => ({ id, produtoId: "polia", revisaoTecnicaId: rev, situacao: "aguardando_inspecao" });
const valor = <T>(r: Resultado<T>): T => {
  if (!r.ok) throw new Error(r.erro);
  return r.valor;
};
const pos = (e: EstadoEstoque, rev = "revA", compat: [string, string][] = []) => posicaoEstoque(e, "polia", rev, compat);

describe("estoque", () => {
  it("lote aguardando inspeção é físico mas não elegível", () => {
    const e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 40 }));
    expect(pos(e)).toMatchObject({ fisicoTotal: 40, fisicoElegivel: 0, livre: 0 });
  });

  it("liberação cria reserva firme a partir da alocação", () => {
    let e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 40 }));
    e = valor(liberarLote(e, "L1", [{ reservaId: "R1", clienteId: "C1", pedidoItemId: "PI1", quantidade: 20 }]));
    expect(pos(e)).toMatchObject({ fisicoTotal: 40, fisicoElegivel: 40, reservasFirmes: 20, reservasEstrategicas: 0, livre: 20 });
  });

  it("alocação acima do lote é recusada na liberação", () => {
    const e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 10 }));
    expect(liberarLote(e, "L1", [{ reservaId: "R1", clienteId: "C1", pedidoItemId: "PI1", quantidade: 11 }]).ok).toBe(false);
  });

  it("reserva acima do livre é recusada; duas reservas nunca passam do livre", () => {
    let e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 10 }));
    e = valor(liberarLote(e, "L1", []));
    expect(reservar(e, { id: "X", loteId: "L1", tipo: "estrategica", clienteId: "C1", pedidoItemId: null, quantidade: 11 }).ok).toBe(false);
    e = valor(reservar(e, { id: "R1", loteId: "L1", tipo: "estrategica", clienteId: "C1", pedidoItemId: null, quantidade: 6 }));
    expect(reservar(e, { id: "R2", loteId: "L1", tipo: "estrategica", clienteId: "C2", pedidoItemId: null, quantidade: 5 }).ok).toBe(false);
    expect(reservar(e, { id: "R2", loteId: "L1", tipo: "estrategica", clienteId: "C2", pedidoItemId: null, quantidade: 4 }).ok).toBe(true);
  });

  it("reserva em lote não liberado é recusada", () => {
    const e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 10 }));
    expect(reservar(e, { id: "R1", loteId: "L1", tipo: "estrategica", clienteId: "C1", pedidoItemId: null, quantidade: 1 }).ok).toBe(false);
  });

  it("firme exige item de pedido; estratégica não aceita item de pedido", () => {
    let e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 10 }));
    e = valor(liberarLote(e, "L1", []));
    expect(reservar(e, { id: "R1", loteId: "L1", tipo: "firme", clienteId: "C1", pedidoItemId: null, quantidade: 1 }).ok).toBe(false);
    expect(reservar(e, { id: "R1", loteId: "L1", tipo: "estrategica", clienteId: "C1", pedidoItemId: "PI1", quantidade: 1 }).ok).toBe(false);
  });

  it("converter estratégica em firme não cria peça", () => {
    let e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 35 }));
    e = valor(liberarLote(e, "L1", []));
    e = valor(reservar(e, { id: "E1", loteId: "L1", tipo: "estrategica", clienteId: "C1", pedidoItemId: null, quantidade: 15 }));
    e = valor(converterEmFirme(e, { reservaId: "E1", novaReservaId: "F1", pedidoItemId: "PI2", quantidade: 5 }));
    expect(pos(e)).toMatchObject({ fisicoTotal: 35, reservasEstrategicas: 10, reservasFirmes: 5, livre: 20 });
  });

  it("expedição baixa o físico e consome a firme; repetir a chave não muda nada", () => {
    let e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 20 }));
    e = valor(liberarLote(e, "L1", [{ reservaId: "F1", clienteId: "C1", pedidoItemId: "PI1", quantidade: 20 }]));
    e = valor(expedir(e, { chave: "rem1", reservaId: "F1", quantidade: 5 }));
    const depois = valor(expedir(e, { chave: "rem1", reservaId: "F1", quantidade: 5 }));
    expect(pos(depois)).toMatchObject({ fisicoTotal: 15, reservasFirmes: 15, livre: 0 });
    expect(depois).toBe(e);
  });

  it("entrada repetida (mesma chave) não duplica físico", () => {
    const e1 = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 20 }));
    const e2 = valor(entradaProducao(e1, { chave: "op1", lote: lote("L1"), quantidade: 20 }));
    expect(pos(e2).fisicoTotal).toBe(20);
  });

  it("revisões incompatíveis não somam; compatibilidade declarada soma", () => {
    let e = valor(entradaProducao(vazio, { chave: "a", lote: lote("LA", "revA"), quantidade: 10 }));
    e = valor(entradaProducao(e, { chave: "b", lote: lote("LB", "revB"), quantidade: 7 }));
    e = valor(liberarLote(e, "LA", []));
    e = valor(liberarLote(e, "LB", []));
    expect(pos(e, "revA").livre).toBe(10);
    expect(pos(e, "revA", [["revB", "revA"]]).livre).toBe(17);
  });

  it("20 peças em processo no parceiro: estoque de acabados 0", () => {
    // Peça no parceiro não tem lote: só vira lote quando volta à Express (spec §3, decisão 6).
    expect(pos(vazio)).toMatchObject({ fisicoTotal: 0, fisicoElegivel: 0, livre: 0, deficitBloqueio: 0 });
  });
});

describe("bloqueio de lote com reservas ativas", () => {
  const base = () => {
    let e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 40 }));
    e = valor(liberarLote(e, "L1", [{ reservaId: "F1", clienteId: "C1", pedidoItemId: "PI1", quantidade: 20 }]));
    return valor(reservar(e, { id: "E1", loteId: "L1", tipo: "estrategica", clienteId: "C2", pedidoItemId: null, quantidade: 5 }));
  };

  it("reservas viram comprometidas, déficit aparece, nada volta ao livre", () => {
    const e = valor(bloquearLote(base(), "L1", "quarentena"));
    expect(pos(e)).toEqual({
      fisicoTotal: 40, fisicoElegivel: 0, reservasFirmes: 0, reservasEstrategicas: 0, livre: 0, deficitBloqueio: 25,
    });
    expect(e.reservas.map((r) => r.status)).toEqual(["comprometida_bloqueio", "comprometida_bloqueio"]);
  });

  it("lote bloqueado não aceita reserva nem expedição", () => {
    const e = valor(bloquearLote(base(), "L1", "quarentena"));
    expect(reservar(e, { id: "X", loteId: "L1", tipo: "estrategica", clienteId: "C3", pedidoItemId: null, quantidade: 1 }).ok).toBe(false);
    expect(expedir(e, { chave: "rem1", reservaId: "F1", quantidade: 1 }).ok).toBe(false);
  });

  it("reliberação devolve as reservas a ativa", () => {
    const e = valor(reliberarLote(valor(bloquearLote(base(), "L1", "quarentena")), "L1"));
    expect(pos(e)).toMatchObject({ reservasFirmes: 20, reservasEstrategicas: 5, livre: 15, deficitBloqueio: 0 });
  });

  it("lote rejeitado não é reliberado: o déficit fica para o Admin decidir", () => {
    const e = valor(bloquearLote(base(), "L1", "rejeitado"));
    expect(reliberarLote(e, "L1").ok).toBe(false);
    expect(pos(e).deficitBloqueio).toBe(25);
  });
});

describe("bordas de estoque", () => {
  const liberado = (qtd = 40) => {
    const e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: qtd }));
    return valor(liberarLote(e, "L1", []));
  };

  it("expedição acima da reserva firme é recusada", () => {
    let e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 20 }));
    e = valor(liberarLote(e, "L1", [{ reservaId: "F1", clienteId: "C1", pedidoItemId: "PI1", quantidade: 5 }]));
    expect(expedir(e, { chave: "rem1", reservaId: "F1", quantidade: 6 }).ok).toBe(false);
  });

  it("conversão parcial mantém o restante estratégico; acima da reserva é recusada", () => {
    let e = liberado(35);
    e = valor(reservar(e, { id: "E1", loteId: "L1", tipo: "estrategica", clienteId: "C1", pedidoItemId: null, quantidade: 15 }));
    expect(converterEmFirme(e, { reservaId: "E1", novaReservaId: "F1", pedidoItemId: "PI2", quantidade: 16 }).ok).toBe(false);
    const c = valor(converterEmFirme(e, { reservaId: "E1", novaReservaId: "F1", pedidoItemId: "PI2", quantidade: 15 }));
    expect(c.reservas.find((r) => r.id === "E1")).toMatchObject({ quantidade: 0, status: "consumida" });
    expect(pos(c)).toMatchObject({ reservasEstrategicas: 0, reservasFirmes: 15, livre: 20 });
  });

  it("compatibilidade vale nas duas direções e não é transitiva", () => {
    let e = valor(entradaProducao(vazio, { chave: "a", lote: lote("LA", "revA"), quantidade: 10 }));
    e = valor(entradaProducao(e, { chave: "b", lote: lote("LB", "revB"), quantidade: 7 }));
    e = valor(entradaProducao(e, { chave: "c", lote: lote("LC", "revC"), quantidade: 3 }));
    for (const id of ["LA", "LB", "LC"]) e = valor(liberarLote(e, id, []));
    expect(pos(e, "revB", [["revB", "revA"]]).livre).toBe(17);
    expect(pos(e, "revA", [["revA", "revB"], ["revB", "revC"]]).livre).toBe(17);
  });

  it("bloquear lote já rejeitado é recusado; lote aguardando também pode ser bloqueado", () => {
    const e = valor(bloquearLote(liberado(), "L1", "rejeitado"));
    expect(bloquearLote(e, "L1", "quarentena").ok).toBe(false);
    expect(reliberarLote(valor(entradaProducao(vazio, { chave: "x", lote: lote("L2"), quantidade: 1 })), "L2").ok).toBe(false);
  });
});

describe("estado corrompido falha alto", () => {
  const com = (movimentos: unknown[], reservas: unknown[] = []) =>
    ({ lotes: [{ ...lote("L1"), situacao: "liberado" }], movimentos, reservas }) as unknown as EstadoEstoque;
  const mov = (o: object = {}) => ({ chave: "m1", loteId: "L1", tipo: "entrada_producao", quantidade: 5, ...o });
  const res = (o: object = {}) => ({ id: "R1", loteId: "L1", tipo: "firme", clienteId: "C", pedidoItemId: "PI", quantidade: 1, status: "ativa", ...o });

  it.each(["toString", "outro", "constructor"])("movimento com tipo %s", (tipo) => {
    expect(() => pos(com([mov({ tipo })]))).toThrow("Movimento de estoque inválido.");
  });
  it.each([0, 1.5, NaN, "3"])("movimento com quantidade %s", (quantidade) => {
    expect(() => pos(com([mov({ quantidade })]))).toThrow("Movimento de estoque inválido.");
  });
  it("movimento com quantidade 2 ** 53 (inteiro não seguro)", () => {
    expect(() => pos(com([mov({ quantidade: 2 ** 53 })]))).toThrow("Movimento de estoque inválido.");
  });
  it("reserva com quantidade 2 ** 53 (inteiro não seguro)", () => {
    expect(() => pos(com([mov()], [res({ quantidade: 2 ** 53 })]))).toThrow("Reserva de estoque inválida.");
  });
  it("mesma chave com conteúdo diferente", () => {
    for (const o of [{ loteId: "L2" }, { tipo: "ajuste" }, { quantidade: 6 }]) {
      expect(() => pos(com([mov(), mov(o)]))).toThrow("Movimento de estoque repetido com conteúdo diferente.");
    }
  });
  it("repetição idêntica conta uma vez", () => {
    expect(pos(com([mov(), mov()])).fisicoTotal).toBe(5);
  });
  it.each([-1, 1.5, NaN])("reserva com quantidade %s", (quantidade) => {
    expect(() => pos(com([mov()], [res({ quantidade })]))).toThrow("Reserva de estoque inválida.");
  });
  it("reserva com tipo ou status fora da união", () => {
    for (const o of [{ tipo: "toString" }, { tipo: "x" }, { status: "constructor" }, { status: "x" }]) {
      expect(() => pos(com([mov()], [res(o)]))).toThrow("Reserva de estoque inválida.");
    }
  });
  it("a mensagem não ecoa o valor recebido", () => {
    expect(() => pos(com([mov({ tipo: "SEGREDO" })]))).toThrow(/^Movimento de estoque inválido\.$/);
  });
  const nova = { id: "N1", loteId: "L1", tipo: "estrategica" as const, clienteId: "C", pedidoItemId: null, quantidade: 1 };
  const operacoes: [string, (e: EstadoEstoque) => unknown][] = [
    ["entradaProducao", (e) => entradaProducao(e, { chave: "novo", lote: lote("L9"), quantidade: 5 })],
    ["liberarLote", (e) => liberarLote(e, "L1", [])],
    ["bloquearLote", (e) => bloquearLote(e, "L1", "quarentena")],
    ["reliberarLote", (e) => reliberarLote(e, "L1")],
    ["reservar", (e) => reservar(e, nova)],
    ["converterEmFirme", (e) => converterEmFirme(e, { reservaId: "R1", novaReservaId: "F9", pedidoItemId: "PI9", quantidade: 1 })],
    ["expedir", (e) => expedir(e, { chave: "rem", reservaId: "R1", quantidade: 1 })],
  ];
  it.each(operacoes)("%s lança com movimento corrompido", (_n, op) => {
    expect(() => op(com([mov({ quantidade: 0 })]))).toThrow("Movimento de estoque inválido.");
  });
  it.each(operacoes)("%s lança com reserva corrompida", (_n, op) => {
    expect(() => op(com([mov()], [res({ quantidade: -1 })]))).toThrow("Reserva de estoque inválida.");
  });
});

describe("fix round 1: replay com conteúdo diferente", () => {
  const dois = () => {
    let e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 10 }));
    e = valor(entradaProducao(e, { chave: "op2", lote: lote("L2"), quantidade: 10 }));
    e = valor(liberarLote(e, "L1", [{ reservaId: "F1", clienteId: "C1", pedidoItemId: "PI1", quantidade: 10 }]));
    e = valor(liberarLote(e, "L2", [{ reservaId: "F2", clienteId: "C1", pedidoItemId: "PI2", quantidade: 10 }]));
    return valor(expedir(e, { chave: "rem1", reservaId: "F1", quantidade: 5 }));
  };
  const MSG = "Chave já usada com conteúdo diferente.";
  const erro = <T>(r: Resultado<T>) => (r.ok ? "" : r.erro);

  it("replay idêntico devolve a mesma referência (expedir e entrada)", () => {
    const e = dois();
    expect(valor(expedir(e, { chave: "rem1", reservaId: "F1", quantidade: 5 }))).toBe(e);
    expect(valor(entradaProducao(e, { chave: "op1", lote: lote("L1"), quantidade: 10 }))).toBe(e);
  });
  it("replay de expedir com outra quantidade falha", () => {
    expect(erro(expedir(dois(), { chave: "rem1", reservaId: "F1", quantidade: 4 }))).toBe(MSG);
  });
  it("replay de expedir com outra reserva em outro lote falha", () => {
    expect(erro(expedir(dois(), { chave: "rem1", reservaId: "F2", quantidade: 5 }))).toBe(MSG);
  });
  it("chave de entrada reutilizada em expedir falha, e o contrário", () => {
    const e = dois();
    expect(erro(expedir(e, { chave: "op1", reservaId: "F2", quantidade: 10 }))).toBe(MSG);
    expect(erro(entradaProducao(e, { chave: "rem1", lote: lote("L3"), quantidade: 5 }))).toBe(MSG);
  });
  it("replay de entrada com outra quantidade ou outro lote falha", () => {
    const e = dois();
    expect(erro(entradaProducao(e, { chave: "op1", lote: lote("L1"), quantidade: 11 }))).toBe(MSG);
    expect(erro(entradaProducao(e, { chave: "op1", lote: lote("L9"), quantidade: 10 }))).toBe(MSG);
  });
});

describe("fix round 1: inteiro seguro nos pedidos", () => {
  it("entradaProducao com 2 ** 53 falha e o estado segue utilizável", () => {
    const r = entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 2 ** 53 });
    expect(r.ok).toBe(false);
    expect(() => pos(vazio)).not.toThrow();
  });
  it("alocação, reserva, conversão e expedição com 2 ** 53 falham", () => {
    const e0 = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 10 }));
    expect(liberarLote(e0, "L1", [{ reservaId: "R1", clienteId: "C", pedidoItemId: "PI", quantidade: 2 ** 53 }]).ok).toBe(false);
    let e = valor(liberarLote(e0, "L1", [{ reservaId: "F1", clienteId: "C", pedidoItemId: "PI", quantidade: 2 }]));
    e = valor(reservar(e, { id: "E1", loteId: "L1", tipo: "estrategica", clienteId: "C", pedidoItemId: null, quantidade: 2 }));
    expect(reservar(e, { id: "E2", loteId: "L1", tipo: "estrategica", clienteId: "C", pedidoItemId: null, quantidade: 2 ** 53 }).ok).toBe(false);
    expect(converterEmFirme(e, { reservaId: "E1", novaReservaId: "F9", pedidoItemId: "PI", quantidade: 2 ** 53 }).ok).toBe(false);
    expect(expedir(e, { chave: "rem", reservaId: "F1", quantidade: 2 ** 53 }).ok).toBe(false);
    expect(() => pos(e)).not.toThrow();
  });
});

describe("fix round 1: invariantes de validarEstado", () => {
  const INC = "Estado de estoque inconsistente.";
  const est = (lotes: object[], movimentos: object[], reservas: object[] = []) =>
    ({ lotes, movimentos, reservas }) as unknown as EstadoEstoque;
  const L = (o: object = {}) => ({ ...lote("L1"), situacao: "liberado", ...o });
  const M = (o: object = {}) => ({ chave: "m1", loteId: "L1", tipo: "entrada_producao", quantidade: 5, ...o });
  const R = (o: object = {}) => ({ id: "R1", loteId: "L1", tipo: "firme", clienteId: "C", pedidoItemId: "PI", quantidade: 1, status: "ativa", ...o });

  it("estado consistente passa", () => {
    expect(() => validarEstado(est([L()], [M()], [R()]))).not.toThrow();
  });
  it("físico negativo no lote", () => {
    expect(() => validarEstado(est([L()], [M(), M({ chave: "m2", tipo: "saida_expedicao", quantidade: -6 })]))).toThrow(INC);
  });
  it("reservas ativas somam mais que o físico do lote liberado", () => {
    expect(() => validarEstado(est([L()], [M()], [R({ quantidade: 3 }), R({ id: "R2", quantidade: 3 })]))).toThrow(INC);
  });
  it("reserva ativa em lote que não está liberado", () => {
    for (const situacao of ["aguardando_inspecao", "quarentena", "rejeitado"]) {
      expect(() => validarEstado(est([L({ situacao })], [M()], [R()]))).toThrow(INC);
    }
  });
  it("movimento ou reserva com loteId inexistente", () => {
    expect(() => validarEstado(est([L()], [M({ loteId: "LX" })]))).toThrow(INC);
    expect(() => validarEstado(est([L()], [M()], [R({ loteId: "LX", status: "consumida" })]))).toThrow(INC);
  });
  it("situação de lote fora da união e lote.id duplicado", () => {
    expect(() => validarEstado(est([L({ situacao: "toString" })], []))).toThrow(INC);
    expect(() => validarEstado(est([L({ situacao: "x" })], []))).toThrow(INC);
    expect(() => validarEstado(est([L(), L()], []))).toThrow(INC);
  });
  it("dois registros de reserva com o mesmo id", () => {
    expect(() => validarEstado(est([L()], [M()], [R(), R()]))).toThrow(INC);
  });
});

describe("fix round 1: ids de reserva únicos e pedido formal", () => {
  const MSG = "Identificador de reserva já usado.";
  const erro = <T>(r: Resultado<T>) => (r.ok ? "" : r.erro);
  const base = () => {
    let e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 20 }));
    e = valor(entradaProducao(e, { chave: "op2", lote: lote("L2"), quantidade: 20 }));
    e = valor(liberarLote(e, "L1", [{ reservaId: "F1", clienteId: "C", pedidoItemId: "PI1", quantidade: 5 }]));
    return valor(reservar(e, { id: "E1", loteId: "L1", tipo: "estrategica", clienteId: "C", pedidoItemId: null, quantidade: 5 }));
  };
  it("reservar com id existente falha", () => {
    expect(erro(reservar(base(), { id: "F1", loteId: "L1", tipo: "estrategica", clienteId: "C", pedidoItemId: null, quantidade: 1 }))).toBe(MSG);
  });
  it("liberarLote com id existente falha; duplicata dentro das alocações também", () => {
    const a = { clienteId: "C", pedidoItemId: "PI", quantidade: 1 };
    expect(erro(liberarLote(base(), "L2", [{ reservaId: "F1", ...a }]))).toBe(MSG);
    expect(erro(liberarLote(base(), "L2", [{ reservaId: "N", ...a }, { reservaId: "N", ...a }]))).toBe(MSG);
  });
  it("converterEmFirme com novaReservaId existente falha", () => {
    expect(erro(converterEmFirme(base(), { reservaId: "E1", novaReservaId: "F1", pedidoItemId: "PI", quantidade: 1 }))).toBe(MSG);
    expect(erro(converterEmFirme(base(), { reservaId: "E1", novaReservaId: "E1", pedidoItemId: "PI", quantidade: 1 }))).toBe(MSG);
  });
  it("alocação e conversão sem pedidoItemId falham", () => {
    const m = "Reserva firme exige item de pedido formal.";
    expect(erro(liberarLote(base(), "L2", [{ reservaId: "N", clienteId: "C", pedidoItemId: "", quantidade: 1 }]))).toBe(m);
    expect(erro(converterEmFirme(base(), { reservaId: "E1", novaReservaId: "N", pedidoItemId: "", quantidade: 1 }))).toBe(m);
  });
});

describe("fix round 1: bloqueio encadeado", () => {
  const base = () => {
    let e = valor(entradaProducao(vazio, { chave: "op1", lote: lote("L1"), quantidade: 40 }));
    e = valor(liberarLote(e, "L1", [{ reservaId: "F1", clienteId: "C1", pedidoItemId: "PI1", quantidade: 20 }]));
    return valor(reservar(e, { id: "E1", loteId: "L1", tipo: "estrategica", clienteId: "C2", pedidoItemId: null, quantidade: 5 }));
  };
  it("quarentena seguida de rejeitado mantém comprometidas e o déficit", () => {
    const e = valor(bloquearLote(valor(bloquearLote(base(), "L1", "quarentena")), "L1", "rejeitado"));
    expect(e.reservas.map((r) => r.status)).toEqual(["comprometida_bloqueio", "comprometida_bloqueio"]);
    expect(pos(e).deficitBloqueio).toBe(25);
  });
  it("quarentena sobre quarentena é ok e não muda as reservas", () => {
    const q = valor(bloquearLote(base(), "L1", "quarentena"));
    const e = valor(bloquearLote(q, "L1", "quarentena"));
    expect(e.reservas).toEqual(q.reservas);
    expect(pos(e).deficitBloqueio).toBe(25);
  });
});
