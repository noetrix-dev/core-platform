import { describe, expect, it } from "vitest";
import { decidirTesteDeBanco } from "./teste-banco";

describe("decidirTesteDeBanco", () => {
  it("CI sem URL lança", () => {
    expect(() => decidirTesteDeBanco({ CI: "true" })).toThrow("Testes de banco exigem DATABASE_URL no CI.");
    expect(() => decidirTesteDeBanco({ CI: "1", DATABASE_URL: "" })).toThrow("Testes de banco exigem DATABASE_URL no CI.");
  });
  it("CI com URL roda", () => {
    expect(decidirTesteDeBanco({ CI: "true", DATABASE_URL: "postgres://x" })).toBe("rodar");
  });
  it("sem CI e sem URL pula", () => {
    expect(decidirTesteDeBanco({})).toBe("pular");
    expect(decidirTesteDeBanco({ CI: "" })).toBe("pular");
  });
  it("sem CI e com URL roda", () => {
    expect(decidirTesteDeBanco({ DATABASE_URL: "postgres://x" })).toBe("rodar");
  });
});
