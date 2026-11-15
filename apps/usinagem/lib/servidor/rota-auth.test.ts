import { afterEach, describe, expect, it, vi } from "vitest";

// A rota importa lib/servidor/auth, que importa ./db: mock do pool (nenhuma query roda aqui).
vi.mock("./db", () => ({ db: vi.fn() }));

afterEach(() => {
  vi.doUnmock("./auth");
  vi.doUnmock("better-auth/next-js");
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

const importarRota = () => import("../../app/api/auth/[...all]/route");

describe("rota de auth: import sem ambiente (como o next build)", () => {
  // Produção, sem segredo nem header de IP (o vitest carregou o .env.local; vazio = ausente).
  function semAmbiente() {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("AUTH_IP_HEADER", "");
    vi.stubEnv("BETTER_AUTH_URL", "");
  }

  // Timeout próprio: scrypt real e import frio, lentos sob a carga dos arquivos em paralelo (intermitente com 5 s).
  it("importar não lança (auth() é lazy) e só exporta GET e POST", async () => {
    semAmbiente();
    const rota = await importarRota();
    expect(Object.keys(rota).sort()).toEqual(["GET", "POST"]);
  }, 30_000);

  it("caminho permitido delega ao auth() real na chamada: sem segredo, é aí que falha", async () => {
    semAmbiente();
    const { GET } = await importarRota();
    expect(() => GET(new Request("http://localhost/api/auth/get-session"))).toThrow("BETTER_AUTH_SECRET ausente ou curto.");
  });
});

describe("rota de auth: integração com o handler do Better Auth espionado", () => {
  async function montar() {
    // Ambiente completo, só de teste; restaurado no afterEach.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", "segredo-de-teste-somente-vitest-0123456789");
    vi.stubEnv("BETTER_AUTH_URL", "https://usinagem.teste.invalid");
    vi.stubEnv("AUTH_IP_HEADER", "x-real-ip");
    const resposta = new Response("ok", { status: 200 });
    const handler = vi.fn<(req: Request) => Promise<Response>>(async () => resposta);
    const auth = vi.fn(() => ({ handler }));
    vi.doMock("./auth", () => ({ auth }));
    const real = await vi.importActual<typeof import("better-auth/next-js")>("better-auth/next-js");
    const toNextJsHandler = vi.fn(real.toNextJsHandler);
    vi.doMock("better-auth/next-js", () => ({ ...real, toNextJsHandler }));
    return { rota: await importarRota(), resposta, handler, auth, toNextJsHandler };
  }

  it.each([
    ["POST", "http://localhost/api/auth/sign-up/email"],
    ["GET", "http://localhost/api/auth/sign-in/email"],
    ["POST", "http://localhost/api/auth/update-user"],
    ["GET", "http://localhost/api/auth/list-sessions"],
  ])("%s %s: 404, sem auth(), sem toNextJsHandler, sem handler", async (metodo, url) => {
    const { rota, handler, auth, toNextJsHandler } = await montar();
    const r = await (metodo === "GET" ? rota.GET : rota.POST)(new Request(url, { method: metodo }));
    expect(r.status).toBe(404);
    expect(await r.text()).toBe("");
    expect(auth).not.toHaveBeenCalled();
    expect(toNextJsHandler).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    ["POST", "http://localhost/api/auth/sign-in/email"],
    ["POST", "http://localhost/api/auth/sign-out"],
    ["GET", "http://localhost/api/auth/get-session"],
  ])("%s %s: handler chamado uma vez com o mesmo Request; a Response volta intacta", async (metodo, url) => {
    const { rota, resposta, handler } = await montar();
    const req = new Request(url, { method: metodo });
    const r = await (metodo === "GET" ? rota.GET : rota.POST)(req);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toBe(req);
    expect(r).toBe(resposta);
  });
});
