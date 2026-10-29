import { describe, expect, it } from "vitest";
import { ErroDominio } from "../comum";
import { posicaoEntrega, validarAceite, type EventoEntrega } from "./saldo";

const ev = (chave: string, tipo: EventoEntrega["tipo"], quantidade: number): EventoEntrega => ({ chave, tipo, quantidade });

describe("saldo de entrega", () => {
  it("sem nada: não programada, saldo = contratado", () => {
    const p = posicaoEntrega(20, 0, []);
    expect(p.saldo).toBe(20);
    expect(p.situacao).toBe("nao_programada");
  });
  it("programação não muda saldo", () => {
    const p = posicaoEntrega(20, 20, []);
    expect(p.saldo).toBe(20);
    expect(p.situacao).toBe("programada");
  });
  it("expedido sem aceite não conta como entregue", () => {
    const p = posicaoEntrega(20, 20, [ev("r1", "expedido", 5)]);
    expect(p.expedido).toBe(5);
    expect(p.aceitoLiquido).toBe(0);
    expect(p.saldo).toBe(20);
  });
  it("devolução reabre saldo", () => {
    const p = posicaoEntrega(10, 10, [ev("a1", "aceito", 4), ev("d1", "devolvido", 1)]);
    expect(p.aceitoLiquido).toBe(3);
    expect(p.saldo).toBe(7);
  });
  it("mesmo evento duas vezes conta uma", () => {
    const p = posicaoEntrega(20, 20, [ev("a1", "aceito", 5), ev("a1", "aceito", 5)]);
    expect(p.aceitoLiquido).toBe(5);
  });
  it("aceite acima do saldo exige aditivo", () => {
    const p = posicaoEntrega(10, 10, [ev("a1", "aceito", 8)]);
    expect(validarAceite(p, 3).ok).toBe(false);
    expect(validarAceite(p, 2).ok).toBe(true);
    expect(validarAceite(p, 0).ok).toBe(false);
  });
  it("pedido com 2 peças diferentes: saldos independentes", () => {
    const a = posicaoEntrega(10, 10, [ev("a1", "aceito", 2)]);
    const b = posicaoEntrega(6, 6, [ev("b1", "aceito", 6)]);
    expect([a.saldo, a.situacao]).toEqual([8, "parcialmente_entregue"]);
    expect([b.saldo, b.situacao]).toEqual([0, "entregue"]);
  });
  it("recusado não conta como aceito nem muda saldo", () => {
    const p = posicaoEntrega(10, 10, [ev("x1", "expedido", 4), ev("x2", "recusado", 4)]);
    expect([p.recusado, p.aceitoLiquido, p.saldo, p.situacao]).toEqual([4, 0, 10, "programada"]);
  });
  it("aceite parcial com devolução: continua parcialmente entregue", () => {
    const p = posicaoEntrega(10, 10, [ev("a1", "aceito", 10), ev("d1", "devolvido", 2)]);
    expect([p.saldo, p.situacao]).toEqual([2, "parcialmente_entregue"]);
  });
  it("aceite total: entregue, saldo 0", () => {
    const p = posicaoEntrega(10, 10, [ev("a1", "aceito", 6), ev("a2", "aceito", 4)]);
    expect([p.saldo, p.situacao]).toEqual([0, "entregue"]);
  });
  it("aceite sem programação: parcialmente entregue", () => {
    const p = posicaoEntrega(10, 0, [ev("a1", "aceito", 3)]);
    expect(p.situacao).toBe("parcialmente_entregue");
  });
  it("aceite exatamente igual ao saldo é válido; saldo 0 recusa qualquer aceite", () => {
    const p = posicaoEntrega(10, 10, [ev("a1", "aceito", 8)]);
    expect(validarAceite(p, 2).ok).toBe(true);
    const cheio = posicaoEntrega(10, 10, [ev("a1", "aceito", 10)]);
    expect(validarAceite(cheio, 1).ok).toBe(false);
  });
  it("aceite negativo ou fracionado é inválido", () => {
    const p = posicaoEntrega(10, 10, []);
    expect(validarAceite(p, -1).ok).toBe(false);
    expect(validarAceite(p, 1.5).ok).toBe(false);
  });
  it("contratado zero nunca é entregue", () => {
    const p = posicaoEntrega(0, 0, []);
    expect([p.saldo, p.situacao]).toEqual([0, "nao_programada"]);
    expect(validarAceite(p, 1).ok).toBe(false);
  });
});

describe("saldo de entrega: dado corrompido falha alto", () => {
  const evento = "Evento de entrega inválido.";
  it("aceito negativo lança", () => {
    expect(() => posicaoEntrega(10, 10, [ev("a1", "aceito", -1)])).toThrow(evento);
  });
  it("aceito fracionado lança", () => {
    expect(() => posicaoEntrega(10, 10, [ev("a1", "aceito", 1.5)])).toThrow(evento);
  });
  it("evento de quantidade 0 lança", () => {
    expect(() => posicaoEntrega(10, 10, [ev("a1", "aceito", 0)])).toThrow(evento);
  });
  it("tipo desconhecido lança", () => {
    expect(() => posicaoEntrega(10, 10, [ev("a1", "cancelado" as never, 1)])).toThrow(evento);
  });
  it("tipo herdado do protótipo (toString) lança", () => {
    expect(() => posicaoEntrega(10, 10, [ev("a1", "toString" as never, 1)])).toThrow(evento);
  });
  it("mesma chave com quantidade diferente lança", () => {
    expect(() => posicaoEntrega(10, 10, [ev("a1", "aceito", 5), ev("a1", "aceito", 6)]))
      .toThrow("Evento de entrega repetido com conteúdo diferente.");
  });
  it("mesma chave com tipo diferente lança", () => {
    expect(() => posicaoEntrega(10, 10, [ev("a1", "aceito", 5), ev("a1", "expedido", 5)]))
      .toThrow("Evento de entrega repetido com conteúdo diferente.");
  });
  it("devolvido 3 com aceito 2 lança", () => {
    expect(() => posicaoEntrega(10, 10, [ev("a1", "aceito", 2), ev("d1", "devolvido", 3)]))
      .toThrow("Devolução maior que o aceito.");
  });
  it("devolução antes do aceite na lista vale pelo total acumulado", () => {
    const p = posicaoEntrega(10, 10, [ev("d1", "devolvido", 1), ev("a1", "aceito", 3)]);
    expect([p.aceitoLiquido, p.saldo]).toEqual([2, 8]);
  });
  it("contratado negativo lança", () => {
    expect(() => posicaoEntrega(-1, 0, [])).toThrow("Posição de entrega inválida.");
  });
  it("programado fracionado lança", () => {
    expect(() => posicaoEntrega(10, 1.5, [])).toThrow("Posição de entrega inválida.");
  });
  it("over-delivery: saldo negativo visível e situação entregue (caracterização)", () => {
    const p = posicaoEntrega(10, 10, [ev("a1", "aceito", 12)]);
    expect([p.saldo, p.situacao]).toEqual([-2, "entregue"]);
  });
});

describe("fim do 1B: inteiro seguro", () => {
  it("evento com 2 ** 53 lança a mensagem genérica", () => {
    expect(() => posicaoEntrega(20, 0, [ev("e1", "aceito", 2 ** 53)])).toThrow(new ErroDominio("Evento de entrega inválido."));
  });
  it("evento com MAX_SAFE_INTEGER é aceito", () => {
    expect(posicaoEntrega(20, 0, [ev("e1", "expedido", Number.MAX_SAFE_INTEGER)]).expedido).toBe(Number.MAX_SAFE_INTEGER);
  });
});
