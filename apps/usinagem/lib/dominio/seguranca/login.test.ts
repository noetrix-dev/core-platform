import { describe, expect, it } from "vitest";
import {
  bloqueioAtivo,
  CHAVE_IP_DESCONHECIDO,
  chaveDeLimite,
  emailParaAuditoria,
  excedeuFalhasPorEmail,
  exigeReautenticacao,
  normalizarEmail,
  registroLogin,
  senhaValida,
} from "./login";

const EMAIL_254 = `${"a".repeat(64)}@${"b".repeat(63)}.${"b".repeat(63)}.${"b".repeat(57)}.com`;

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
  it("bloqueado vira login_bloqueado, mesmo formato", () => {
    const r = registroLogin({ email: "a@x.invalid", sucesso: false, bloqueado: true, ip: null, userAgent: null, usuarioId: "u1" });
    expect(r).toMatchObject({ operacao: "login_bloqueado", entidade: "usuarios", entidadeId: "u1", autorId: "u1" });
    expect(r.depois).toEqual({ email: "a@x.invalid", ip: null, userAgent: null });
  });
  it("e-mail bruto inválido nunca é gravado", () => {
    const r = registroLogin({ email: "lixo <script>", sucesso: false, ip: null, userAgent: null, usuarioId: "u1" });
    expect((r.depois as { email: unknown }).email).toBeNull();
  });
  it.each([
    ["127.0.0.1", "127.0.0.1"],
    ["::1", "::1"],
    ["2001:db8::1", "2001:db8::1"],
    ["1.2.3.4, 5.6.7.8", null],
    ["x".repeat(10_000), null],
    ["127.0.0.1\nX: 1", null],
    ["", null],
    [null, null],
  ])("ip %j é gravado como %j", (ip, esperado) => {
    const r = registroLogin({ email: "a@x.invalid", sucesso: false, ip, userAgent: null, usuarioId: "u1" });
    expect((r.depois as { ip: unknown }).ip).toBe(esperado);
  });
  it("user agent com 300 emojis é cortado em 256 pontos de código sem surrogate solto", () => {
    const r = registroLogin({ email: "a@x.invalid", sucesso: false, ip: null, userAgent: "😀".repeat(300), usuarioId: "u1" });
    const ua = (r.depois as { userAgent: string }).userAgent;
    expect(Array.from(ua)).toHaveLength(256);
    expect(ua.isWellFormed()).toBe(true);
  });
  it("user agent perde NUL e caracteres de controle", () => {
    const r = registroLogin({ email: "a@x.invalid", sucesso: false, ip: null, userAgent: "a\u0000b\r\nc\u007fd", usuarioId: "u1" });
    expect((r.depois as { userAgent: string }).userAgent).toBe("abcd");
  });
  it("user agent perde controle C1 (U+0085)", () => {
    const r = registroLogin({ email: "a@x.invalid", sucesso: false, ip: null, userAgent: "a\u0085b", usuarioId: "u1" });
    expect((r.depois as { userAgent: string }).userAgent).toBe("ab");
  });
  const IP_45 = "0000:0000:0000:0000:0000:ffff:255.255.255.255";
  it("fronteira do ip: 45 caracteres válidos passam, 46 viram null", () => {
    expect(IP_45).toHaveLength(45);
    const ok = registroLogin({ email: "a@x.invalid", sucesso: false, ip: IP_45, userAgent: null, usuarioId: "u1" });
    expect((ok.depois as { ip: unknown }).ip).toBe(IP_45);
    expect(chaveDeLimite(IP_45)).toBe(IP_45);
    const longo = `0${IP_45}`;
    expect(longo).toHaveLength(46);
    const ko = registroLogin({ email: "a@x.invalid", sucesso: false, ip: longo, userAgent: null, usuarioId: "u1" });
    expect((ko.depois as { ip: unknown }).ip).toBeNull();
    expect(chaveDeLimite(longo)).toBe("desconhecido");
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

describe("bloqueioAtivo: janela deslizante de 15 min", () => {
  const MIN = 60 * 1000;
  const agora = new Date("2026-10-29T12:00:00Z");
  const antes = (ms: number) => new Date(agora.getTime() - ms);
  // n falhas, a mais recente `ultima` ms antes de agora, uma a cada `passo` ms.
  const falhas = (n: number, ultima: number, passo = 1000) => Array.from({ length: n }, (_, i) => antes(ultima + i * passo));

  it("sem falhas não bloqueia", () => expect(bloqueioAtivo([], agora)).toBe(false));
  it("9 falhas recentes nunca bloqueiam", () => expect(bloqueioAtivo(falhas(9, 0), agora)).toBe(false));
  it("10 falhas recentes bloqueiam", () => expect(bloqueioAtivo(falhas(10, 0), agora)).toBe(true));
  it("15 min menos 1 ms depois da última: ainda bloqueado", () => expect(bloqueioAtivo(falhas(10, 15 * MIN - 1), agora)).toBe(true));
  it("exatamente 15 min depois da última: desbloqueado", () => expect(bloqueioAtivo(falhas(10, 15 * MIN), agora)).toBe(false));
  // 9 falhas recentes mais 1 que fica `distancia` ms antes da mais recente.
  const espalhadas = (distancia: number) => [...falhas(9, 0, 1), antes(distancia)];
  it("10 falhas espalhadas por mais de 15 min não bloqueiam", () => expect(bloqueioAtivo(espalhadas(15 * MIN + 1), agora)).toBe(false));
  it("10 falhas com a primeira exatamente 15 min antes da última não bloqueiam (janela aberta no início)", () => {
    expect(bloqueioAtivo(espalhadas(15 * MIN), agora)).toBe(false);
  });
  it("10 falhas em 15 min menos 1 ms bloqueiam", () => expect(bloqueioAtivo(espalhadas(15 * MIN - 1), agora)).toBe(true));
  it("falhas antigas fora da janela da última não somam", () => {
    expect(bloqueioAtivo([...falhas(9, 0), ...falhas(5, 20 * MIN)], agora)).toBe(false);
  });
  it("ordem das falhas não importa", () => expect(bloqueioAtivo(falhas(10, 0).reverse(), agora)).toBe(true));
  it("falha no futuro (relógio do banco adiantado) conta, não some", () => {
    const futuras = Array.from({ length: 10 }, (_, i) => new Date(agora.getTime() + (i + 1) * 1000));
    expect(bloqueioAtivo(futuras, agora)).toBe(true);
    // Quando o relógio alcança, vale o instante gravado: 15 min depois da última, livre.
    expect(bloqueioAtivo(futuras, new Date(agora.getTime() + 10 * 1000 + 15 * MIN))).toBe(false);
  });
});

describe("e-mail na auditoria nunca é o texto bruto", () => {
  it.each([
    [" A@X.invalid ", "a@x.invalid"],
    ["nao-e-email <script>", null],
    ["a@x.invalid\nX-Injetado: 1", null],
    ["a@x.invalid\r\nBcc: v@x.invalid", null],
    [`${"a".repeat(250)}@x.invalid`, null],
    [EMAIL_254, EMAIL_254],
    [`${EMAIL_254}a`, null],
    ["", null],
    [123, null],
    [null, null],
  ])("%j vira %j", (entrada, esperado) => {
    expect(emailParaAuditoria(entrada)).toBe(esperado);
  });
});

describe("política de senha", () => {
  it.each([
    ["x".repeat(11), false],
    ["x".repeat(12), true],
    ["x".repeat(128), true],
    ["x".repeat(129), false],
    [12, false],
    // Caractere de controle (\n, \r, \t, NUL) não é digitável no campo de senha: recusado.
    ["x".repeat(12) + "\n", false],
    ["x".repeat(12) + "\r", false],
    ["x".repeat(6) + "\t" + "x".repeat(6), false],
    ["x".repeat(12) + "\u0000", false],
    ["  senha com espaço  ", true],
  ])(
    "%#", (s, ok) => expect(senhaValida(s)).toBe(ok),
  );
});

describe("chave do limite por IP", () => {
  it("balde único se chama desconhecido", () => expect(CHAVE_IP_DESCONHECIDO).toBe("desconhecido"));
  it.each([
    ["127.0.0.1", "127.0.0.1"],
    [" 127.0.0.1 ", "127.0.0.1"],
    ["::1", "::1"],
    ["2001:DB8::A", "2001:db8::a"],
    [null, "desconhecido"],
    [undefined, "desconhecido"],
    ["", "desconhecido"],
    [123, "desconhecido"],
    ["1.2.3.4, 5.6.7.8", "desconhecido"],
    ["127.0.0.1\nX: 1", "desconhecido"],
    ["x".repeat(10_000), "desconhecido"],
  ])("%j vira %j", (ip, esperado) => {
    expect(chaveDeLimite(ip)).toBe(esperado);
  });
});
