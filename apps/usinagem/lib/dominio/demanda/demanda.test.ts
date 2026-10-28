import { describe, expect, it } from "vitest";
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
      { pedidoItemId: "p1", quantidade: 5 },
    ]);
    expect(r.formalizado).toBe(5);
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
