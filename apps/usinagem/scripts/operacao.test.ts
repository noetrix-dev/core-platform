import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough, Readable, Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, describe, expect, it, vi } from "vitest";
import * as schema from "../lib/servidor/db/schema";
import { main as criar } from "./criar-usuario";
import { main as desbloquear } from "./desbloquear-usuario";
import { ehExecucaoDireta, lerSenha, MSG_FALHA, MSG_ROLE } from "./operacao";
import { main as redefinir } from "./redefinir-senha";

const SENHA = "segredo-de-teste-sem-eco-42";

/** Saída falsa: grava tudo o que o código escreve. */
function gravador() {
  let texto = "";
  const saida = new Writable({
    write(c, _e, cb) {
      texto += String(c);
      cb();
    },
  });
  return { saida, texto: () => texto };
}

describe("ehExecucaoDireta", () => {
  it("caminho com espaço e acento: compara pela URL de arquivo codificada", () => {
    const caminho = "/tmp/pasta com espaço/operação/criar-usuario.ts";
    const url = pathToFileURL(caminho).href;
    expect(url).toContain("%20");
    expect(ehExecucaoDireta(url, caminho)).toBe(true);
  });
  it("outro arquivo ou argv[1] ausente: false", () => {
    expect(ehExecucaoDireta(pathToFileURL("/a/b.ts").href, "/a/c.ts")).toBe(false);
    expect(ehExecucaoDireta(pathToFileURL("/a/b.ts").href, undefined)).toBe(false);
  });
});

describe("lerSenha", () => {
  it("fora de TTY lê toda a entrada e corta uma única quebra de linha final; não escreve nada", async () => {
    for (const [entrada, esperado] of [
      [`${SENHA}\n`, SENHA],
      [`${SENHA}\r\n`, SENHA],
      [SENHA, SENHA],
      [`${SENHA}\n\n`, `${SENHA}\n`],
      [` ${SENHA} `, ` ${SENHA} `],
    ]) {
      const g = gravador();
      expect(await lerSenha(Readable.from([entrada]), g.saida)).toBe(esperado);
      expect(g.texto()).toBe("");
    }
  });

  const tty = () => Object.assign(new PassThrough(), { isTTY: true });

  it("em TTY pede duas vezes, devolve a senha e nunca a escreve na saída", async () => {
    const entrada = tty();
    const g = gravador();
    const lida = lerSenha(entrada, g.saida);
    entrada.write(`${SENHA}\r`);
    await new Promise((r) => setImmediate(r));
    entrada.write(`${SENHA}\r`);
    expect(await lida).toBe(SENHA);
    expect(g.texto()).toContain("Senha:");
    expect(g.texto()).toContain("Confirme a senha:");
    expect(g.texto()).not.toContain(SENHA);
    expect(g.texto()).not.toContain(SENHA.slice(0, 4));
  });

  it("em TTY, confirmação diferente devolve null", async () => {
    const entrada = tty();
    const g = gravador();
    const lida = lerSenha(entrada, g.saida);
    entrada.write(`${SENHA}\r`);
    await new Promise((r) => setImmediate(r));
    entrada.write(`${SENHA}x\r`);
    expect(await lida).toBeNull();
    expect(g.texto()).not.toContain(SENHA);
  });

  it("em TTY, entrada encerrada (Ctrl+D) devolve null em vez de travar", async () => {
    const entrada = tty();
    const lida = lerSenha(entrada, gravador().saida);
    entrada.end();
    expect(await lida).toBeNull();
  });
});

describe("scripts de operação: role, banco fora e fonte", () => {
  const SCRIPTS = ["criar-usuario.ts", "redefinir-senha.ts", "desbloquear-usuario.ts", "operacao.ts"];
  const execucoes = (banco: Parameters<typeof criar>[1]["banco"], saida: string[], senha: () => Promise<string | null>) => {
    const deps = { banco, log: (m: string) => saida.push(`log:${m}`), erro: (m: string) => saida.push(`erro:${m}`) };
    const hash = vi.fn(async () => "x");
    return [
      () => criar(["[FICTÍCIO] Nome", "a@ficticio.invalid", "tecnico"], { ...deps, hash, senha, operador: null }),
      () => redefinir(["a@ficticio.invalid"], { ...deps, hash, senha, operador: null }),
      () => desbloquear(["a@ficticio.invalid"], deps),
    ];
  };

  it("nenhum script referencia a URL da role de migração", () => {
    for (const s of SCRIPTS) expect(readFileSync(join(__dirname, s), "utf8")).not.toContain("DATABASE_URL_MIGRACAO");
  });

  it("role diferente de usinagem_app: recusa com mensagem fixa, sem pedir senha nem escrever", async () => {
    const execute = vi.fn(async () => ({ rows: [{ u: "usinagem_migracao" }] }));
    const banco = { execute } as unknown as Parameters<typeof criar>[1]["banco"];
    const senha = vi.fn(async () => SENHA);
    const saida: string[] = [];
    for (const rodar of execucoes(banco, saida, senha)) expect(await rodar()).toBe(1);
    expect(saida).toEqual(Array(3).fill(`erro:${MSG_ROLE}`));
    expect(senha).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(3);
  });

  describe("banco fora do ar", () => {
    const banco = drizzle("postgres://ninguem:nada@127.0.0.1:1/nenhum", { schema });
    afterAll(() => banco.$client.end());

    it("mensagem fixa, código 1, sem stack nem detalhe do pg, sem rejeição", async () => {
      const saida: string[] = [];
      const senha = vi.fn(async () => SENHA);
      for (const rodar of execucoes(banco, saida, senha)) await expect(rodar()).resolves.toBe(1);
      expect(saida).toEqual(Array(3).fill(`erro:${MSG_FALHA}`));
      expect(saida.join("\n")).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|at |nada/);
      expect(senha).not.toHaveBeenCalled();
    });
  });
});
