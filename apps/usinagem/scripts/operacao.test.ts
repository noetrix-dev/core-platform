import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough, Readable, Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, describe, expect, it, vi } from "vitest";
import * as schema from "../lib/servidor/db/schema";
import { main as criar } from "./criar-usuario";
import { main as desbloquear } from "./desbloquear-usuario";
import { userInfo } from "node:os";
import { operadorValido } from "../lib/servidor/usuarios-auth";
import { ErroDominio } from "../lib/dominio/comum";
import {
  ehExecucaoDireta,
  ErroConfiguracao,
  lerSenha,
  mensagemDeErro,
  MSG_CONEXAO,
  MSG_CONFIG,
  MSG_DUPLICADO,
  MSG_FALHA,
  MSG_PERFIL,
  MSG_ROLE,
  operadorAtual,
} from "./operacao";
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
      [`${SENHA}\r`, SENHA],
      [SENHA, SENHA],
      [`${SENHA}\n\n`, `${SENHA}\n`],
      [` ${SENHA} `, ` ${SENHA} `],
      // Não apara: espaços no início, no meio e no fim fazem parte da senha.
      ["  senha com espaço  \n", "  senha com espaço  "],
      ["abc def ghi jkl\r\n", "abc def ghi jkl"],
      // Só um terminador sai: o "\n" que sobra é da senha (e senhaValida recusa caractere de controle).
      ["x".repeat(12) + "\n\n", "x".repeat(12) + "\n"],
    ]) {
      const g = gravador();
      expect(await lerSenha(Readable.from([entrada]), g.saida)).toBe(esperado);
      expect(g.texto()).toBe("");
    }
  });

  it("fora de TTY, caractere UTF-8 dividido entre dois pedaços chega inteiro", async () => {
    const senha = "senha-ação-çé€-😀-123";
    const bytes = Buffer.from(`${senha}\n`, "utf8");
    // Corta no meio de cada caractere de vários bytes (ç = 2, € = 3, 😀 = 4).
    const cortes = [bytes.indexOf(Buffer.from("ç")) + 1, bytes.indexOf(Buffer.from("€")) + 2, bytes.indexOf(Buffer.from("😀")) + 3];
    const entrada = new PassThrough();
    const lida = lerSenha(entrada, gravador().saida);
    let ini = 0;
    for (const fim of [...cortes, bytes.length]) {
      entrada.write(bytes.subarray(ini, fim));
      await new Promise((r) => setImmediate(r));
      ini = fim;
    }
    entrada.end();
    expect(await lida).toBe(senha);
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

  it.each([
    ["  senha com espaço  \r", "  senha com espaço  "],
    ["abc def ghi jkl\r\n", "abc def ghi jkl"],
    ["  senha com espaço  \n", "  senha com espaço  "],
  ])("em TTY, %j (digitado duas vezes) vira %j, sem aparar", async (digitado, esperado) => {
    const entrada = tty();
    const g = gravador();
    const lida = lerSenha(entrada, g.saida);
    entrada.write(digitado);
    await new Promise((r) => setTimeout(r, 5));
    entrada.write(digitado);
    expect(await lida).toBe(esperado);
    expect(g.texto()).not.toContain(esperado);
  });

  it("em TTY, x*12 + \\n\\n: o segundo Enter é a confirmação vazia, então não confere (null)", async () => {
    const entrada = tty();
    const lida = lerSenha(entrada, gravador().saida);
    entrada.write("x".repeat(12) + "\n\n");
    expect(await lida).toBeNull();
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

describe("mensagemDeErro: uma frase fixa por classe, nunca o texto do pg", () => {
  // Como o drizzle embrulha: DrizzleQueryError com a query e os parâmetros na mensagem, o erro do pg em `cause`.
  const doDrizzle = (cause: object) => Object.assign(new Error("Failed query: insert into usuarios\nparams: segredo-param"), { cause });
  const pg = (code: string, extra: object = {}) =>
    Object.assign(new Error(`erro do pg ${code} detalhe-sigiloso`), { code, detail: "Key (email)=(fulano@ficticio.invalid)", ...extra });

  it.each([
    ["conexão recusada", Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" }), MSG_CONEXAO],
    ["conexão recusada embrulhada", doDrizzle(Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" })), MSG_CONEXAO],
    ["falha de conexão (SQLSTATE 08006)", pg("08006"), MSG_CONEXAO],
    ["host não encontrado", Object.assign(new Error("getaddrinfo ENOTFOUND db"), { code: "ENOTFOUND" }), MSG_CONEXAO],
    ["configuração ausente", new ErroConfiguracao(), MSG_CONFIG],
    ["senha do banco errada (28P01)", pg("28P01"), MSG_CONFIG],
    ["e-mail duplicado (23505)", doDrizzle(pg("23505", { constraint: "usuarios_email_unique" })), MSG_DUPLICADO],
    ["perfil inexistente (23503 na FK de perfil)", doDrizzle(pg("23503", { constraint: "usuarios_perfil_id_perfis_id_fk" })), MSG_PERFIL],
    ["outra FK (23503)", doDrizzle(pg("23503", { constraint: "usuarios_criado_por_usuarios_id_fk" })), MSG_FALHA],
    ["outro SQLSTATE", doDrizzle(pg("22P02")), MSG_FALHA],
    ["erro qualquer", new Error("boom segredo-param"), MSG_FALHA],
    ["não-Error", "segredo-param", MSG_FALHA],
  ])("%s", (_n, e, esperado) => {
    const m = mensagemDeErro(e);
    expect(m).toBe(esperado);
    expect(m).not.toMatch(/segredo|sigiloso|ECONNREFUSED|ENOTFOUND|127\.0\.0\.1|fulano|Failed query|usuarios_/);
  });

  it("as classes têm frases distintas entre si", () => {
    expect(new Set([MSG_CONEXAO, MSG_CONFIG, MSG_DUPLICADO, MSG_PERFIL, MSG_FALHA, MSG_ROLE]).size).toBe(6);
  });

  it("ErroDominio sai com a própria mensagem (fixa e registrada)", () => {
    expect(mensagemDeErro(new ErroDominio("Senha fora da política."))).toBe("Senha fora da política.");
  });
});

describe("operadorAtual", () => {
  it("vem de os.userInfo().username, nunca de USER/LOGNAME", () => {
    vi.stubEnv("USER", "operador_falso_env");
    vi.stubEnv("LOGNAME", "operador_falso_env");
    try {
      expect(operadorAtual()).toBe(operadorValido(userInfo().username));
      expect(operadorAtual()).not.toBe("operador_falso_env");
    } finally {
      vi.unstubAllEnvs();
    }
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

  it.each(["a@b", "a@localhost", "fulano@ficticio", "a@b.c"])(
    "e-mail sem TLD que o z.email() do login recusa (%j): cada script recusa com a mensagem fixa, sem hash nem escrita",
    async (email) => {
      const execute = vi.fn(async () => ({ rows: [{ u: "usinagem_app" }] }));
      // Só a checagem de role existe: qualquer consulta além dela lançaria e sairia com outra mensagem.
      const banco = { execute } as unknown as Parameters<typeof criar>[1]["banco"];
      const saida: string[] = [];
      const deps = { banco, log: (m: string) => saida.push(`log:${m}`), erro: (m: string) => saida.push(`erro:${m}`) };
      const hash = vi.fn(async () => "x");
      const senha = async () => SENHA;
      expect(await criar(["[FICTÍCIO] Nome", email, "tecnico"], { ...deps, hash, senha, operador: null })).toBe(1);
      expect(await redefinir([email], { ...deps, hash, senha, operador: null })).toBe(1);
      expect(await desbloquear([email], deps)).toBe(1);
      expect(saida).toEqual(["erro:E-mail inválido.", "erro:E-mail inválido ou não encontrado.", "erro:E-mail inválido ou não encontrado."]);
      expect(hash).not.toHaveBeenCalled();
      expect(execute).toHaveBeenCalledTimes(3);
    },
  );

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
      expect(saida).toEqual(Array(3).fill(`erro:${MSG_CONEXAO}`));
      expect(saida.join("\n")).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|at |nada/);
      expect(senha).not.toHaveBeenCalled();
    });
  });
});
