import { describe, expect, it } from "vitest";
import {
  emailParaAuditoria,
  excedeuFalhasPorEmail,
  exigeReautenticacao,
  normalizarEmail,
  registroLogin,
  senhaValida,
} from "./login";

describe("registroLogin", () => {
  it("sucesso e falha viram operações distintas, e-mail normalizado, sem senha", () => {
    const ok = registroLogin({ email: " A@X.invalid ", sucesso: true, ip: "127.0.0.1", userAgent: "ua", usuarioId: "u1" });
    const ko = registroLogin({ email: "a@x.invalid", sucesso: false, ip: null, userAgent: null, usuarioId: "u2" });
    expect(ok).toMatchObject({ operacao: "login_sucesso", entidade: "usuarios", entidadeId: "u1", autorId: "u1" });
    expect(ko).toMatchObject({ operacao: "login_falha", entidadeId: "u2", autorId: "u2" });
    expect(ok.depois).toEqual({ email: "a@x.invalid", ip: "127.0.0.1", userAgent: "ua" });
    expect(JSON.stringify([ok, ko])).not.toMatch(/senha|password/i);
  });
  it("user agent é cortado em 256 caracteres", () => {
    const r = registroLogin({ email: "a@x.invalid", sucesso: false, ip: null, userAgent: "x".repeat(1000), usuarioId: "u1" });
    expect((r.depois as { userAgent: string }).userAgent).toHaveLength(256);
  });
  it("e-mail bruto inválido nunca é gravado", () => {
    const r = registroLogin({ email: "lixo <script>", sucesso: false, ip: null, userAgent: null, usuarioId: "u1" });
    expect((r.depois as { email: unknown }).email).toBeNull();
  });
  it("e-mail que não é string vira vazio", () => {
    expect(normalizarEmail(123)).toBe("");
    expect(normalizarEmail({ toString: () => "a@x" })).toBe("");
  });
});

describe("reautenticação recente (10 min)", () => {
  const agora = new Date("2026-10-29T10:20:00Z");
  it.each([
    ["5 min", "2026-10-29T10:15:00Z", false],
    ["exatamente 10 min", "2026-10-29T10:10:00Z", false],
    ["10 min e 1 s", "2026-10-29T10:09:59Z", true],
    ["no futuro", "2026-10-29T10:21:00Z", true],
  ])("sessão de %s", (_n, criada, exige) => {
    expect(exigeReautenticacao(new Date(criada), agora)).toBe(exige);
  });
  it("sem sessão real (seletor de dev) exige sempre", () => {
    expect(exigeReautenticacao(null, agora)).toBe(true);
  });
});

describe("limite por e-mail", () => {
  it.each([[0, false], [9, false], [10, true], [11, true]])("%i falhas: %s", (n, r) => {
    expect(excedeuFalhasPorEmail(n)).toBe(r);
  });
});

describe("e-mail na auditoria nunca é o texto bruto", () => {
  it.each([
    [" A@X.invalid ", "a@x.invalid"],
    ["nao-e-email <script>", null],
    ["a@x.invalid\nX-Injetado: 1", null],
    ["a@x.invalid\r\nBcc: v@x.invalid", null],
    [`${"a".repeat(250)}@x.invalid`, null],
    [`${"a".repeat(254 - "@x.invalid".length)}@x.invalid`, `${"a".repeat(254 - "@x.invalid".length)}@x.invalid`],
    [`${"a".repeat(255 - "@x.invalid".length)}@x.invalid`, null],
    ["", null],
    [123, null],
    [null, null],
  ])("%j vira %j", (entrada, esperado) => {
    expect(emailParaAuditoria(entrada)).toBe(esperado);
  });
});

describe("política de senha", () => {
  it.each([["x".repeat(11), false], ["x".repeat(12), true], ["x".repeat(128), true], ["x".repeat(129), false], [12, false]])(
    "%#", (s, ok) => expect(senhaValida(s)).toBe(ok),
  );
});
