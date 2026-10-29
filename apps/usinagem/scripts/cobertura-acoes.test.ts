import { describe, expect, it } from "vitest";
import { arquivosVerificados, violacoes } from "./cobertura-acoes";

describe("cobertura do wrapper de permissão", () => {
  it("aceita ações via acao/acaoPublica e tipos", () => {
    const codigo = `"use server";\nimport { acao } from "@/lib/servidor/acao";\nexport type X = number;\nexport const salvar = acao("processo.editar", esquema, async () => 1);\nexport const entrar = acaoPublica(esquema, async () => 1);`;
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
  it("route.ts precisa exportar métodos via rota()", () => {
    expect(violacoes("app/api/x/route.ts", `export const GET = rota("processo.ver", async () => new Response())`)).toEqual([]);
    expect(violacoes("app/api/x/route.ts", `export async function GET() {}`)).toHaveLength(1);
  });
  it("route.ts recusa export default e re-export", () => {
    expect(violacoes("app/api/x/route.ts", `export default rota("processo.ver", async () => new Response())`)).toHaveLength(1);
    expect(violacoes("app/api/x/route.ts", `export { GET } from "./outro";`)).toHaveLength(1);
  });
  it("route.ts só com configuração de segmento passa", () => {
    expect(violacoes("app/api/x/route.ts", `export const dynamic = "force-dynamic";`)).toEqual([]);
  });
  it("o código real do app não tem violação", () => {
    const todas = arquivosVerificados().flatMap(({ caminho, codigo }) => violacoes(caminho, codigo));
    expect(todas).toEqual([]);
  });
});
