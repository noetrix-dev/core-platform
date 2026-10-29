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
