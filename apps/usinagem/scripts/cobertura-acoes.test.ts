import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACOES_PUBLICAS, arquivosVerificados, violacoes } from "./cobertura-acoes";

const IMP = `import { acao, acaoPublica } from "@/lib/servidor/acao";\n`;
const IMP_ROTA = `import { rota } from "@/lib/servidor/acao";\n`;
const PUBLICAS = ["app/x/actions.ts"];

describe("cobertura do wrapper de permissão", () => {
  // Alteração de teste: a fixture do brief usava acaoPublica/rota sem import e fora de ACOES_PUBLICAS; as regras novas exigem os dois.
  it("aceita ações via acao/acaoPublica e tipos", () => {
    const codigo = `"use server";\n${IMP}export type X = number;\nexport interface Y { a: 1 }\nexport const salvar = acao("processo.editar", esquema, async () => 1);\nexport const entrar = acaoPublica(esquema, async () => 1);`;
    expect(violacoes("app/x/actions.ts", codigo, PUBLICAS)).toEqual([]);
  });
  it("aceita imports relativos que terminam em lib/servidor/acao", () => {
    const codigo = `"use server";\nimport { acao } from "../../lib/servidor/acao";\nexport const salvar = acao("processo.editar", e, async () => 1);`;
    expect(violacoes("app/x/actions.ts", codigo)).toEqual([]);
  });
  it("recusa função exportada direto num arquivo use server", () => {
    expect(violacoes("app/x/actions.ts", `"use server";\nexport async function salvar() {}`)).toHaveLength(1);
    expect(violacoes("app/x/actions.ts", `'use server'\nexport const salvar = async () => {}`)).toHaveLength(1);
    expect(violacoes("app/x/actions.ts", `"use server";\nexport default async function x() {}`)).toHaveLength(1);
  });
  it("recusa export function em arquivo use server depois de bloco de comentário", () => {
    const codigo = `// cabeçalho\n/* mais\n   comentário */\n"use server";\nexport function salvar() {}`;
    expect(violacoes("app/x/actions.ts", codigo)).toHaveLength(1);
  });
  it("recusa re-export em arquivo use server", () => {
    expect(violacoes("app/x/actions.ts", `"use server";\nimport { salvar } from "./impl";\nexport { salvar };`)).toHaveLength(1);
    expect(violacoes("app/x/actions.ts", `"use server";\nexport { salvar } from "./impl";`)).toHaveLength(1);
  });
  it("recusa use server inline (ação dentro de componente)", () => {
    expect(violacoes("app/x/page.tsx", `export default function P() { async function f() { "use server"; } }`)).toHaveLength(1);
  });
  it("recusa use server que não é o primeiro statement", () => {
    expect(violacoes("app/x/actions.ts", `const a = 1;\n"use server";\nexport type X = 1;`)).toHaveLength(1);
  });
  it("route.ts precisa exportar métodos via rota()", () => {
    expect(violacoes("app/api/x/route.ts", `${IMP_ROTA}export const GET = rota("processo.ver", async () => new Response())`)).toEqual([]);
    expect(violacoes("app/api/x/route.ts", `export async function GET() {}`)).toHaveLength(1);
  });
  it("route.ts recusa export default e re-export", () => {
    expect(violacoes("app/api/x/route.ts", `${IMP_ROTA}export default rota("processo.ver", async () => new Response())`)).toHaveLength(1);
    expect(violacoes("app/api/x/route.ts", `export { GET } from "./outro";`)).toHaveLength(1);
  });
  it("route.ts só com configuração de segmento passa", () => {
    expect(violacoes("app/api/x/route.ts", `export const dynamic = "force-dynamic";`)).toEqual([]);
  });

  describe("desvios do review (AST)", () => {
    const caminhos = ["app/x/actions.ts", "app/api/x/route.ts"];
    const cru = (c: string) => (c.endsWith("route.ts") ? IMP_ROTA : `"use server";\nimport { acao } from "@/lib/servidor/acao";\n`);
    const casos: [string, (c: string) => string][] = [
      ["export em uma linha e função na seguinte", (c) => `${cru(c)}export\nasync function salvar() {}`],
      ["export{ salvar } sem espaço", (c) => `${cru(c)}const salvar = 1;\nexport{ salvar };`],
      ["dois declarantes no mesmo export const", (c) => `${cru(c)}export const a = ${c.endsWith("route.ts") ? "rota" : "acao"}("processo.ver", e, async () => 1), b = async () => {};`],
    ];
    for (const caminho of caminhos) {
      it.each(casos)(`${caminho}: recusa %s`, (_nome, monta) => {
        expect(violacoes(caminho, monta(caminho)).length).toBeGreaterThanOrEqual(1);
      });
    }
    it("arquivos .js e .mjs com export cru são recusados", () => {
      expect(violacoes("app/x/actions.js", `"use server";\nexport async function salvar() {}`)).toHaveLength(1);
      expect(violacoes("app/x/actions.mjs", `"use server";\nexport const salvar = async () => {};`)).toHaveLength(1);
      expect(violacoes("app/api/x/route.js", `export async function GET() {}`)).toHaveLength(1);
      expect(violacoes("app/api/x/route.mjs", `export const GET = async () => {};`)).toHaveLength(1);
    });
    it("acao declarada localmente não vale", () => {
      const codigo = `"use server";\nconst acao = (...a: unknown[]) => a;\nexport const salvar = acao("processo.ver", e, async () => 1);`;
      expect(violacoes("app/x/actions.ts", codigo)).toHaveLength(1);
      const rt = `const rota = (...a: unknown[]) => a;\nexport const GET = rota("processo.ver", async () => new Response());`;
      expect(violacoes("app/api/x/route.ts", rt)).toHaveLength(1);
    });
    it("import com alias não vale", () => {
      const codigo = `"use server";\nimport { acaoPublica as acao } from "@/lib/servidor/acao";\nexport const salvar = acao(e, async () => 1);`;
      expect(violacoes("app/x/actions.ts", codigo, PUBLICAS).length).toBeGreaterThanOrEqual(1);
      const rt = `import { rota as r } from "@/lib/servidor/acao";\nexport const GET = r("processo.ver", async () => new Response());`;
      expect(violacoes("app/api/x/route.ts", rt).length).toBeGreaterThanOrEqual(1);
    });
    it("import de outro módulo não vale", () => {
      const codigo = `"use server";\nimport { acao } from "./falso";\nexport const salvar = acao("processo.ver", e, async () => 1);`;
      expect(violacoes("app/x/actions.ts", codigo)).toHaveLength(1);
    });
    it("arquivo use server fora de app/ é varrido pela raiz", () => {
      expect(violacoes("actions.ts", `"use server";\nexport async function salvar() {}`)).toHaveLength(1);
    });
    it("export default é sempre violação em route", () => {
      expect(violacoes("app/api/x/route.ts", `export default async function () {}`)).toHaveLength(1);
    });
  });

  describe("ACOES_PUBLICAS", () => {
    const codigo = `"use server";\n${IMP}export const entrar = acaoPublica(esquema, async () => 1);`;
    it("começa vazia", () => {
      expect(ACOES_PUBLICAS).toEqual([]);
    });
    it("acaoPublica em arquivo fora da lista é violação", () => {
      expect(violacoes("app/x/actions.ts", codigo, [])).toHaveLength(1);
      expect(violacoes("app/x/actions.ts", codigo)).toHaveLength(1);
    });
    it("com o caminho na lista, nenhuma", () => {
      expect(violacoes("app/x/actions.ts", codigo, ["app/x/actions.ts"])).toEqual([]);
    });
    it("acao comum não depende da lista", () => {
      expect(violacoes("app/x/actions.ts", `"use server";\nimport { acao } from "@/lib/servidor/acao";\nexport const s = acao("processo.ver", e, async () => 1);`, [])).toEqual([]);
    });
  });

  it("o código real do app não tem violação", () => {
    const todas = arquivosVerificados().flatMap(({ caminho, codigo }) => violacoes(caminho, codigo));
    expect(todas).toEqual([]);
  });
  it("a varredura cobre a raiz, não só app/lib/components, e ignora o que deve", () => {
    const caminhos = arquivosVerificados().map((a) => a.caminho);
    expect(caminhos).toContain("lib/servidor/acao.ts");
    expect(caminhos).toContain("next.config.ts");
    expect(caminhos.some((c) => c.startsWith("node_modules/") || c.startsWith(".next/") || c.startsWith("scripts/") || c.startsWith("drizzle/"))).toBe(false);
    expect(caminhos.some((c) => /\.test\.[cm]?[jt]sx?$/.test(c))).toBe(false);
  });
});

describe("fim do 1B: cobertura", () => {
  const CRU = `"use server";\nexport async function salvar() {}`;
  const monta = (arquivos: Record<string, string>) => {
    const raiz = mkdtempSync(join(tmpdir(), "cobertura-"));
    for (const [c, codigo] of Object.entries(arquivos)) {
      mkdirSync(dirname(join(raiz, c)), { recursive: true });
      writeFileSync(join(raiz, c), codigo);
    }
    return raiz;
  };

  describe("IGNORADOS só no primeiro nível", () => {
    it("scripts, drizzle e .vitest aninhados são varridos; na raiz seguem ignorados", () => {
      const raiz = monta({
        "app/(admin)/scripts/actions.ts": CRU,
        "lib/drizzle/acoes.ts": CRU,
        "app/.vitest/a.ts": CRU,
        "scripts/x.ts": CRU,
        "drizzle/y.ts": CRU,
        ".vitest/z.ts": CRU,
        "node_modules/m/i.ts": CRU,
        "app/ok.ts": "export const a = 1;",
      });
      try {
        const achados = arquivosVerificados(raiz);
        const caminhos = achados.map((a) => a.caminho).sort();
        expect(caminhos).toEqual(["app/(admin)/scripts/actions.ts", "app/.vitest/a.ts", "app/ok.ts", "lib/drizzle/acoes.ts"].sort());
        const comViolacao = achados.filter((a) => violacoes(a.caminho, a.codigo).length > 0).map((a) => a.caminho).sort();
        expect(comViolacao).toEqual(["app/(admin)/scripts/actions.ts", "app/.vitest/a.ts", "lib/drizzle/acoes.ts"].sort());
      } finally {
        rmSync(raiz, { recursive: true, force: true });
      }
    });
  });

  describe("diretiva lida pelo valor decodificado", () => {
    it('"use\\x20server" no topo com export cru é violação', () => {
      expect(violacoes("app/x/actions.ts", `"use\\x20server";\nexport async function salvar() {}`)).toHaveLength(1);
      expect(violacoes("app/x/actions.ts", `'use\\u0020server';\nexport const salvar = async () => {};`)).toHaveLength(1);
    });
    it('"use\\x20server" inline é violação', () => {
      expect(violacoes("app/x/page.tsx", `export default function P() { async function f() { "use\\x20server"; } }`)).toHaveLength(1);
    });
  });

  describe("new ErroDominio só com mensagem constante", () => {
    const v = (codigo: string) => violacoes("lib/dominio/x/x.ts", codigo);
    it("literal passa", () => {
      expect(v(`throw new ErroDominio("Estado inválido.");`)).toEqual([]);
    });
    it("template sem substituição passa", () => {
      expect(v("throw new ErroDominio(`Estado inválido.`);")).toEqual([]);
    });
    it("const de módulo inicializada com literal passa", () => {
      expect(v(`const INCONSISTENTE = "Estado inconsistente.";\nfunction f() { throw new ErroDominio(INCONSISTENTE); }`)).toEqual([]);
    });
    it("template com ${v} é violação", () => {
      expect(v("function f(x: string) { throw new ErroDominio(`Lote ${x} inválido.`); }")).toHaveLength(1);
    });
    it("concatenação é violação", () => {
      expect(v(`function f(x: string) { throw new ErroDominio("Lote " + x); }`)).toHaveLength(1);
    });
    it("variável, parâmetro, let e const não literal são violação", () => {
      expect(v(`function f(m: string) { throw new ErroDominio(m); }`)).toHaveLength(1);
      expect(v(`let M = "a";\nthrow new ErroDominio(M);`)).toHaveLength(1);
      expect(v(`const M = g();\nthrow new ErroDominio(M);`)).toHaveLength(1);
      expect(v(`const M = "a" + b;\nthrow new ErroDominio(M);`)).toHaveLength(1);
    });
    it("const declarada dentro de função não conta como de módulo", () => {
      expect(v(`function f() { const M = "a"; throw new ErroDominio(M); }`)).toHaveLength(1);
    });
    it("segundo argumento (cause) é violação", () => {
      expect(v(`throw new ErroDominio("a", { cause: e });`)).toHaveLength(1);
    });
    it("vale em qualquer arquivo varrido, não só em lib/dominio", () => {
      expect(violacoes("app/x/page.tsx", "const f = (x: string) => new ErroDominio(`a ${x}`);")).toHaveLength(1);
    });
  });

  describe("referências a ErroDominio", () => {
    const v = (codigo: string, caminho = "lib/dominio/x/x.ts") => violacoes(caminho, codigo);
    const IMP = `import { ErroDominio } from "../comum";\n`;
    it("usos legítimos passam: new, instanceof, tipo, import sem alias, declaração em comum.ts", () => {
      expect(v(`${IMP}throw new ErroDominio("a");`)).toEqual([]);
      expect(v(`${IMP}const ok = (e: unknown) => e instanceof ErroDominio;`)).toEqual([]);
      expect(v(`${IMP}const f = (e: ErroDominio) => e;`)).toEqual([]);
      expect(v(`export class ErroDominio extends Error {}`, "lib/dominio/comum.ts")).toEqual([]);
    });
    it("import com alias é violação", () => {
      expect(v(`import { ErroDominio as X } from "../comum";\nthrow new X(valor);`)).toHaveLength(1);
      expect(v(`import { Outro as ErroDominio } from "../outro";\nthrow new ErroDominio("a");`)).toHaveLength(1);
    });
    it("import por namespace seguido de ns.ErroDominio é violação, com e sem new", () => {
      expect(v(`import * as d from "../comum";\nthrow new d.ErroDominio(valor);`)).toHaveLength(1);
      expect(v(`import * as d from "../comum";\nthrow d.ErroDominio(valor);`)).toHaveLength(1);
      expect(v(`import * as d from "../comum";\nthrow new d["ErroDominio"](valor);`)).toHaveLength(1);
    });
    it("referência solta é violação: const f = ErroDominio, extends, re-export, argumento", () => {
      expect(v(`${IMP}const F = ErroDominio;\nthrow new F(valor);`)).toHaveLength(1);
      expect(v(`${IMP}class Mine extends ErroDominio {}`)).toHaveLength(1);
      expect(v(`export { ErroDominio } from "../comum";`)).toHaveLength(1);
      expect(v(`${IMP}const criar = (C: unknown) => C;\ncriar(ErroDominio);`)).toHaveLength(1);
    });
    it("outra classe ErroDominio declarada fora de lib/dominio/comum.ts é violação", () => {
      expect(v(`export class ErroDominio extends Error {}`)).toHaveLength(1);
    });
    it("somar não tem regra especial: somar local com mensagem variável não abre exceção", () => {
      expect(v(`${IMP}export function somar(v: number[], mensagem: string) { throw new ErroDominio(mensagem); }`)).toHaveLength(1);
    });
  });
});
