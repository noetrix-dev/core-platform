import { describe, expect, it } from "vitest";
import { formatarNumeroProcesso, validarNumeroInicial } from "./numeracao";

describe("numeração", () => {
  it("formata número e letra", () => {
    expect(formatarNumeroProcesso(357, "A")).toBe("357-A");
  });
  it("início precisa ser inteiro positivo", () => {
    expect(validarNumeroInicial(0, null).ok).toBe(false);
    expect(validarNumeroInicial(1.5, null).ok).toBe(false);
    expect(validarNumeroInicial(357, null).ok).toBe(true);
  });
  it("início precisa passar do maior já usado", () => {
    expect(validarNumeroInicial(300, 356).ok).toBe(false);
    expect(validarNumeroInicial(356, 356).ok).toBe(false);
    expect(validarNumeroInicial(357, 356).ok).toBe(true);
  });
});
