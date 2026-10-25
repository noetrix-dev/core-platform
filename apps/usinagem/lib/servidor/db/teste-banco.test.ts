import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("bancoDisponivel", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  it("avisa uma única vez por processo", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("CI", "");
    vi.resetModules();
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { bancoDisponivel } = await import("./teste-banco");
    expect(bancoDisponivel()).toBe(false);
    expect(bancoDisponivel()).toBe(false);
    expect(aviso).toHaveBeenCalledTimes(1);
  });
});
