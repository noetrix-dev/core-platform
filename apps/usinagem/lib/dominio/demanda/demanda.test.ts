import { describe, expect, it } from "vitest";
import { ErroDominio } from "../comum";
import { posicaoDemanda } from "./demanda";

describe("demanda e pedido formal", () => {
  it("demanda 20, pedido 5: 15 não formalizadas", () => {
    expect(posicaoDemanda(20, [{ pedidoItemId: "p1", quantidade: 5 }])).toEqual({
      demanda: 20, formalizado: 5, naoFormalizado: 15, acimaDaDemanda: 0,
    });
  });
  it("novos pedidos 5 + 10 sobre a mesma demanda: contratado 20, previsão 0", () => {
    const r = posicaoDemanda(20, [
      { pedidoItemId: "p1", quantidade: 5 },
      { pedidoItemId: "p2", quantidade: 5 },
      { pedidoItemId: "p3", quantidade: 10 },
    ]);
    expect(r.formalizado).toBe(20);
    expect(r.naoFormalizado).toBe(0);
  });
  it("registrar o mesmo item de pedido de novo não duplica (último valor vale, como aditivo)", () => {
    const r = posicaoDemanda(20, [
      { pedidoItemId: "p1", quantidade: 5 },
      { pedidoItemId: "p1", quantidade: 7 },
    ]);
    expect(r.formalizado).toBe(7);
  });
  it("pedido acima da demanda fica visível", () => {
    expect(posicaoDemanda(20, [{ pedidoItemId: "p1", quantidade: 25 }]).acimaDaDemanda).toBe(5);
  });
  it("sem vínculos: tudo não formalizado", () => {
    expect(posicaoDemanda(20, [])).toEqual({ demanda: 20, formalizado: 0, naoFormalizado: 20, acimaDaDemanda: 0 });
  });
  it("exatamente igual à demanda: nada pendente e nada acima", () => {
    const r = posicaoDemanda(20, [{ pedidoItemId: "p1", quantidade: 20 }]);
    expect([r.naoFormalizado, r.acimaDaDemanda]).toEqual([0, 0]);
  });
  it("mesmo item com valor diferente: o último vale (aditivo)", () => {
    const r = posicaoDemanda(20, [
      { pedidoItemId: "p1", quantidade: 5 },
      { pedidoItemId: "p1", quantidade: 8 },
    ]);
    expect(r.formalizado).toBe(8);
  });
  it("demanda zero sem vínculos: tudo zero", () => {
    expect(posicaoDemanda(0, [])).toEqual({ demanda: 0, formalizado: 0, naoFormalizado: 0, acimaDaDemanda: 0 });
  });
  it("demanda zero com pedido: tudo acima da demanda", () => {
    const r = posicaoDemanda(0, [{ pedidoItemId: "p1", quantidade: 3 }]);
    expect([r.naoFormalizado, r.acimaDaDemanda]).toEqual([0, 3]);
  });
});

describe("demanda: dado corrompido falha alto", () => {
  it("vínculo negativo lança", () => {
    expect(() => posicaoDemanda(20, [{ pedidoItemId: "p1", quantidade: -5 }])).toThrow("Vínculo de demanda inválido.");
  });
  it("vínculo fracionado lança", () => {
    expect(() => posicaoDemanda(20, [{ pedidoItemId: "p1", quantidade: 2.5 }])).toThrow("Vínculo de demanda inválido.");
  });
  it("demanda negativa lança", () => {
    expect(() => posicaoDemanda(-1, [])).toThrow("Posição de demanda inválida.");
  });
  it("vínculo zero é válido: aditivo que cancela o item, último valor vale", () => {
    const r = posicaoDemanda(20, [
      { pedidoItemId: "p1", quantidade: 5 },
      { pedidoItemId: "p1", quantidade: 0 },
      { pedidoItemId: "p2", quantidade: 3 },
    ]);
    expect(r.formalizado).toBe(3);
    expect(posicaoDemanda(20, [{ pedidoItemId: "p1", quantidade: 0 }]).formalizado).toBe(0);
  });
});

describe("fim do 1B: inteiro seguro", () => {
  it("vínculo com 2 ** 53 lança a mensagem genérica", () => {
    expect(() => posicaoDemanda(20, [{ pedidoItemId: "p1", quantidade: 2 ** 53 }])).toThrow(new ErroDominio("Vínculo de demanda inválido."));
  });
  it("vínculo com MAX_SAFE_INTEGER é aceito", () => {
    expect(posicaoDemanda(20, [{ pedidoItemId: "p1", quantidade: Number.MAX_SAFE_INTEGER }]).formalizado).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("revisão final: soma segura", () => {
  it("dois vínculos válidos cuja soma estoura lançam", () => {
    expect(() =>
      posicaoDemanda(20, [{ pedidoItemId: "p1", quantidade: Number.MAX_SAFE_INTEGER }, { pedidoItemId: "p2", quantidade: 1 }]),
    ).toThrow(new ErroDominio("Soma fora do limite seguro."));
  });
});
