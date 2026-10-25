import { describe, expect, it } from "vitest";
import { deduplicarPorChave, ehQuantidadeValida, falha, ok } from "./comum";

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
  it("Resultado", () => {
    expect(ok(1)).toEqual({ ok: true, valor: 1 });
    expect(falha("x")).toEqual({ ok: false, erro: "x" });
  });
});
