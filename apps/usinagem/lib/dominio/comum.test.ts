import { describe, expect, it } from "vitest";
import { deduplicarPorChave, ehQuantidadeValida, ErroDominio, falha, ok, somar } from "./comum";

describe("comum", () => {
  it("deduplica pela chave, primeiro vence", () => {
    const r = deduplicarPorChave([
      { chave: "a", v: 1 },
      { chave: "b", v: 2 },
      { chave: "a", v: 3 },
    ]);
    expect(r).toEqual([{ chave: "a", v: 1 }, { chave: "b", v: 2 }]);
  });
  it("quantidade válida é inteira e positiva", () => {
    expect(ehQuantidadeValida(5)).toBe(true);
    expect(ehQuantidadeValida(0)).toBe(false);
    expect(ehQuantidadeValida(-1)).toBe(false);
    expect(ehQuantidadeValida(1.5)).toBe(false);
  });
  it("quantidade válida é inteiro seguro: 2 ** 53 não, MAX_SAFE_INTEGER sim", () => {
    expect(ehQuantidadeValida(2 ** 53)).toBe(false);
    expect(ehQuantidadeValida(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(ehQuantidadeValida(Number.NaN)).toBe(false);
    expect(ehQuantidadeValida(Number.POSITIVE_INFINITY)).toBe(false);
  });
  it("somar: soma inteiros seguros, vazio dá 0, aceita negativos", () => {
    expect(somar([1, 2, 3], "m")).toBe(6);
    expect(somar([], "m")).toBe(0);
    expect(somar([Number.MAX_SAFE_INTEGER, -1], "m")).toBe(Number.MAX_SAFE_INTEGER - 1);
    expect(somar([Number.MAX_SAFE_INTEGER], "m")).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("somar: estouro do inteiro seguro lança ErroDominio com a mensagem dada", () => {
    expect(() => somar([Number.MAX_SAFE_INTEGER, 1], "estourou")).toThrow(new ErroDominio("estourou"));
    expect(() => somar([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER], "estourou")).toThrow("estourou");
    expect(() => somar([-Number.MAX_SAFE_INTEGER, -1], "estourou")).toThrow("estourou");
  });
  it("somar: valor não finito ou fracionário lança", () => {
    expect(() => somar([1, Number.NaN], "m")).toThrow("m");
    expect(() => somar([1.5], "m")).toThrow("m");
  });
  it("Resultado", () => {
    expect(ok(1)).toEqual({ ok: true, valor: 1 });
    expect(falha("x")).toEqual({ ok: false, erro: "x" });
  });
});
