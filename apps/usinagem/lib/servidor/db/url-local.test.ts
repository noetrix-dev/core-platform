import { describe, expect, it } from "vitest";
import { Client } from "pg";
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
    expect((erro as Error).cause).toBeUndefined();
    expect(JSON.stringify(erro, Object.getOwnPropertyNames(erro))).not.toContain("segredo");
  });

  it("documenta o parser do pg: ?host= na query sobrescreve o host da URL", () => {
    const client = new Client({
      connectionString: "postgres://u:p@localhost:54329/usinagem?host=db.exemplo.com",
    });
    // OBSERVADO_PG
    expect(client.host).toBe("db.exemplo.com");
    // Por isso a guarda não pode olhar só o hostname: precisa da allowlist de parâmetros.
  });

  it.each(["host=db.exemplo.com", "hostaddr=10.0.0.1", "port=5432", "service=x", "options=-c%20x", "foo=bar"])(
    "recusa parâmetro de query %s",
    (q) => {
      let erro: unknown;
      try { urlLocal(`postgres://u:p@localhost:54329/usinagem?${q}`); } catch (e) { erro = e; }
      expect((erro as Error).message).toBe("A URL do banco é inválida.");
      expect((erro as Error).cause).toBeUndefined();
    },
  );

  it("aceita sslmode e application_name", () => {
    const u = "postgres://u:p@localhost:54329/usinagem?sslmode=disable&application_name=erp";
    expect(urlLocal(u)).toBe(u);
  });

  it.each([
    "postgres://localhost@db.exemplo.com/x",
    "postgres://u:p@localhost.exemplo.com/x",
    "postgres://u:p@127.0.0.1.nip.io/x",
    "postgres://u:p@[::1]:54329/x",
    "postgres:///usinagem",
    "postgres://a,b/db",
  ])("recusa host adversarial %s", (u) => {
    let erro: unknown;
    try { urlLocal(u); } catch (e) { erro = e; }
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).not.toContain("exemplo");
    expect((erro as Error).message).not.toContain("nip.io");
    expect((erro as Error).cause).toBeUndefined();
  });
});
