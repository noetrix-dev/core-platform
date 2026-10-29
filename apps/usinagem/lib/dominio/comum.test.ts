import { describe, expect, it } from "vitest";
import { deduplicarPorChave, ehQuantidadeValida, ErroDominio, falha, MENSAGENS_DE_DOMINIO, ok, somar } from "./comum";

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
    expect(somar([1, 2, 3])).toBe(6);
    expect(somar([])).toBe(0);
    expect(somar([Number.MAX_SAFE_INTEGER, -1])).toBe(Number.MAX_SAFE_INTEGER - 1);
    expect(somar([Number.MAX_SAFE_INTEGER])).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("somar: estouro do inteiro seguro lança ErroDominio com a mensagem fixa", () => {
    expect(() => somar([Number.MAX_SAFE_INTEGER, 1])).toThrow(new ErroDominio("Soma fora do limite seguro."));
    expect(() => somar([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER])).toThrow("Soma fora do limite seguro.");
    expect(() => somar([-Number.MAX_SAFE_INTEGER, -1])).toThrow("Soma fora do limite seguro.");
  });
  it("somar: valor não finito ou fracionário lança", () => {
    expect(() => somar([1, Number.NaN])).toThrow("Soma fora do limite seguro.");
    expect(() => somar([1.5])).toThrow("Soma fora do limite seguro.");
  });
  it("Resultado", () => {
    expect(ok(1)).toEqual({ ok: true, valor: 1 });
    expect(falha("x")).toEqual({ ok: false, erro: "x" });
  });

  describe("ErroDominio fecha a mensagem em runtime", () => {
    const GENERICA = "Erro de domínio.";
    it("mensagem fora do conjunto vira a genérica (valor nunca entra)", () => {
      expect(new ErroDominio("valor-secreto 123").message).toBe(GENERICA);
      expect(new ErroDominio("").message).toBe(GENERICA);
    });
    it("mensagem registrada passa igual", () => {
      expect(new ErroDominio("Estado de estoque inconsistente.").message).toBe("Estado de estoque inconsistente.");
      expect(MENSAGENS_DE_DOMINIO.has("Soma fora do limite seguro.")).toBe(true);
    });
    it("instância é congelada: reatribuir message lança TypeError e não muda", () => {
      const e = new ErroDominio("Soma fora do limite seguro.");
      expect(Object.isFrozen(e)).toBe(true);
      expect(() => {
        e.message = "x";
      }).toThrow(TypeError);
      expect(e.message).toBe("Soma fora do limite seguro.");
    });
    it("Object.assign e concatenação no message lançam", () => {
      const e = new ErroDominio("Soma fora do limite seguro.");
      expect(() => Object.assign(e, { message: "x" })).toThrow(TypeError);
      expect(() => {
        e.message += "valor";
      }).toThrow(TypeError);
      expect(e.message).toBe("Soma fora do limite seguro.");
    });
    it("construtor obtido da instância também sanitiza", () => {
      const e = new ErroDominio("Soma fora do limite seguro.");
      const outro = new (e.constructor as typeof ErroDominio)("valor-secreto");
      expect(outro.message).toBe(GENERICA);
    });
    it("continua sendo Error com nome ErroDominio", () => {
      const e = new ErroDominio("Soma fora do limite seguro.");
      expect(e).toBeInstanceOf(Error);
      expect(e.name).toBe("ErroDominio");
    });
  });
});
