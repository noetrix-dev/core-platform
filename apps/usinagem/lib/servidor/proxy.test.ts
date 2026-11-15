import { NextRequest } from "next/server";
import * as estatico from "next/dist/build/analysis/get-page-static-info";
import { getMiddlewareRouteMatcher } from "next/dist/shared/lib/router/utils/middleware-route-matcher";
import type { ProxyMatcher } from "next/dist/build/analysis/get-page-static-info";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "../../proxy";

afterEach(() => vi.unstubAllEnvs());

const req = (caminho: string, cookie?: string) =>
  new NextRequest(`https://usinagem.teste.invalid${caminho}`, cookie ? { headers: { cookie } } : undefined);
const redirecionaParaEntrar = (r: Response) => r.status === 307 && r.headers.get("location") === "https://usinagem.teste.invalid/entrar";
const segue = (r: Response) => r.headers.get("x-middleware-next") === "1" && !r.headers.get("location");

function ambiente(nodeEnv: string, switcher?: string) {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("ENABLE_DEV_SWITCHER", switcher);
}

describe("proxy: cookie de sessão", () => {
  // getSessionCookie procura `__Secure-<nome>` e depois `<nome>` (better-auth dist/cookies/index.mjs:216).
  it.each(["usinagem.session_token=abc", "__Secure-usinagem.session_token=abc", "x=1; usinagem.session_token=abc; y=2"])(
    "com %s segue",
    (cookie) => {
      ambiente("production");
      expect(segue(proxy(req("/clientes", cookie)))).toBe(true);
    },
  );

  it.each([undefined, "better-auth.session_token=abc", "usinagem.session_data=abc", "usinagem.session_token=", "__Host-usinagem.session_token=abc"])(
    "sem o cookie do app (%s) redireciona para /entrar",
    (cookie) => {
      ambiente("production");
      expect(redirecionaParaEntrar(proxy(req("/clientes", cookie)))).toBe(true);
    },
  );
});

describe("proxy: bypass de dev", () => {
  it("development com ENABLE_DEV_SWITCHER=1 segue sem cookie", () => {
    ambiente("development", "1");
    expect(segue(proxy(req("/clientes")))).toBe(true);
  });

  it.each([
    ["production", "1"],
    ["test", "1"],
    ["development", "true"],
    ["development", "yes"],
    ["development", " 1"],
    ["development", "0"],
    ["development", ""],
    ["development", undefined],
    ["Development", "1"],
  ])("NODE_ENV=%s ENABLE_DEV_SWITCHER=%s sem cookie redireciona para /entrar", (nodeEnv, switcher) => {
    ambiente(nodeEnv, switcher);
    expect(redirecionaParaEntrar(proxy(req("/clientes")))).toBe(true);
  });
});

describe("proxy: matcher compilado pelo próprio Next", () => {
  // Mesmo caminho do build (get-page-static-info.js:333) e do servidor (middleware-route-matcher.js:12).
  const { getMiddlewareMatchers } = estatico as unknown as { getMiddlewareMatchers: (m: unknown, c: object) => ProxyMatcher[] };
  const casa = getMiddlewareRouteMatcher(getMiddlewareMatchers(config.matcher, {}));
  // O servidor testa o pathname cru e o decodificado (resolve-routes.js:337-344); o proxy roda se qualquer um casar.
  const roda = (p: string) => casa(p, {} as never, {}) || casa(decodeURIComponent(p), {} as never, {});

  it.each([
    "/entrar",
    "/entrar/",
    "/entrar/x",
    "/api/auth/sign-in/email",
    "/api/auth/get-session",
    "/api/auth",
    "/dev/perfil",
    "/_next/static/chunks/a.js",
    "/_next/image",
    "/favicon.ico",
  ])("%s fica fora do proxy", (p) => {
    expect(roda(p)).toBe(false);
  });

  it.each([
    "/",
    "/clientes",
    "/entrarx",
    "/entrar-x",
    "/api/authx",
    "/api/authx/sign-in/email",
    "/api/outra",
    "/dev",
    "/devx/a",
    "/_next/staticx",
    "/_next/imagex",
    "/favicon.icox",
    "/x/entrar",
    "/x/api/auth/a",
    "/%65ntrar/x",
    "/_next/data/build/clientes.json",
  ])("%s passa pelo proxy", (p) => {
    expect(roda(p)).toBe(true);
  });
});
