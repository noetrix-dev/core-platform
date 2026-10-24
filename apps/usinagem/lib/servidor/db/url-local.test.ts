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
});
