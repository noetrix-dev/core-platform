import { describe, expect, it } from "vitest";
import { urlLocal } from "./url-local";

describe("urlLocal", () => {
  it("aceita localhost e 127.0.0.1", () => {
    expect(urlLocal("postgres://u:p@localhost:54329/usinagem")).toContain("localhost");
    expect(urlLocal("postgres://u:p@127.0.0.1:5432/usinagem")).toContain("127.0.0.1");
  });
  it("recusa host remoto", () => {
    expect(() => urlLocal("postgres://u:p@db.exemplo.com:5432/x")).toThrow("Postgres local");
  });
  it("recusa ausente", () => {
    expect(() => urlLocal(undefined)).toThrow("não definida");
  });
  it("URL malformada: mensagem genérica, sem vazar a senha", () => {
    let erro: unknown;
    try { urlLocal("postgres://u:segredo@[malformada"); } catch (e) { erro = e; }
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toBe("A URL do banco é inválida.");
    expect(JSON.stringify(erro, Object.getOwnPropertyNames(erro))).not.toContain("segredo");
  });
});
