import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/** Rotas que não passam pelo wrapper, com motivo. O 1D acrescenta a do Better Auth. */
export const ROTAS_ISENTAS: readonly string[] = [];

const DIRETIVA_NO_TOPO = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*\s*["']use server["']/;
const ACAO_OK = /^export const \w+ = (?:acao|acaoPublica)\(/;
const ROTA_OK = /^export const (?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) = rota\(/;
// Configuração de segmento não é handler.
const CONFIG_ROTA = /^export const (?:dynamic|revalidate|runtime|preferredRegion|maxDuration) = /;

export function violacoes(caminho: string, codigo: string): string[] {
  const erros: string[] = [];
  const exports = codigo.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("export ") && !l.startsWith("export type "));
  const topo = DIRETIVA_NO_TOPO.test(codigo);
  if (topo) {
    for (const l of exports) if (!ACAO_OK.test(l)) erros.push(`${caminho}: export fora de acao(): ${l}`);
  }
  const ocorrencias = codigo.match(/["']use server["']/g)?.length ?? 0;
  if (ocorrencias > (topo ? 1 : 0)) erros.push(`${caminho}: "use server" inline não é permitido; use um arquivo de ações com acao().`);
  if (/(^|\/)route\.tsx?$/.test(caminho) && !ROTAS_ISENTAS.includes(caminho)) {
    for (const l of exports) if (!ROTA_OK.test(l) && !CONFIG_ROTA.test(l)) erros.push(`${caminho}: handler fora de rota(): ${l}`);
  }
  return erros;
}

const DIRETORIOS = ["app", "lib", "components"];
const EXTENSAO = /\.tsx?$/;

export function arquivosVerificados(raiz = process.cwd()): { caminho: string; codigo: string }[] {
  return DIRETORIOS.flatMap((d) => {
    let nomes: string[];
    try {
      nomes = readdirSync(join(raiz, d), { recursive: true }) as string[];
    } catch {
      return [];
    }
    return nomes
      .filter((n) => EXTENSAO.test(n) && !n.endsWith(".test.ts"))
      .map((n) => {
        const abs = join(raiz, d, n);
        return { caminho: relative(raiz, abs), codigo: readFileSync(abs, "utf8") };
      });
  });
}
