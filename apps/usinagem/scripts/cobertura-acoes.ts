import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

/** Rotas que não passam pelo wrapper, com motivo. O 1D acrescenta a do Better Auth. */
export const ROTAS_ISENTAS: readonly string[] = [];
/** Arquivos autorizados a usar acaoPublica (ação sem sessão por natureza, ex.: login). Cada entrada é revisada. */
export const ACOES_PUBLICAS: readonly string[] = [];

const MODULO_WRAPPER = "lib/servidor/acao";
const CONFIG_ROTA = new Set(["dynamic", "revalidate", "runtime", "preferredRegion", "maxDuration"]);

const ehModuloWrapper = (spec: string) => spec === `@/${MODULO_WRAPPER}` || ((spec.startsWith("./") || spec.startsWith("../")) && spec.endsWith(MODULO_WRAPPER));
const ehRota = (caminho: string) => /(^|\/)route\.[cm]?[jt]sx?$/.test(caminho) && !ROTAS_ISENTAS.includes(caminho);
const ehDiretiva = (n: ts.Node): n is ts.ExpressionStatement =>
  ts.isExpressionStatement(n) && (ts.isStringLiteral(n.expression) || ts.isNoSubstitutionTemplateLiteral(n.expression));
const exportado = (n: ts.Statement) =>
  ts.isExportDeclaration(n) || ts.isExportAssignment(n) || (ts.canHaveModifiers(n) && !!ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));

/** Nomes importados do wrapper por import nomeado sem alias e sem `type`. */
function importsLegitimos(sf: ts.SourceFile): Set<string> {
  const nomes = new Set<string>();
  for (const s of sf.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier) || !ehModuloWrapper(s.moduleSpecifier.text)) continue;
    const b = s.importClause?.namedBindings;
    if (s.importClause?.isTypeOnly || !b || !ts.isNamedImports(b)) continue;
    for (const e of b.elements) if (!e.isTypeOnly && !e.propertyName) nomes.add(e.name.text);
  }
  return nomes;
}

/** Quantas vezes o nome é ligado no topo do arquivo (import, const, function, class). Mais de um = sombra. */
function ligacoes(sf: ts.SourceFile, nome: string): number {
  let n = 0;
  for (const s of sf.statements) {
    if (ts.isImportDeclaration(s)) {
      const c = s.importClause;
      if (c?.name?.text === nome) n++;
      if (c?.namedBindings && ts.isNamespaceImport(c.namedBindings) && c.namedBindings.name.text === nome) n++;
      if (c?.namedBindings && ts.isNamedImports(c.namedBindings)) for (const e of c.namedBindings.elements) if (e.name.text === nome) n++;
    } else if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name) ? d.name.text === nome : d.name.getText().includes(nome)) n++;
    } else if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s) || ts.isEnumDeclaration(s)) && s.name?.text === nome) n++;
  }
  return n;
}

export function violacoes(caminho: string, codigo: string, publicas: readonly string[] = ACOES_PUBLICAS): string[] {
  const erros: string[] = [];
  const sf = ts.createSourceFile(caminho, codigo, ts.ScriptTarget.Latest, true);
  const linha = (n: ts.Node) => n.getText(sf).split("\n")[0];

  // Prólogo de diretivas: statements iniciais que são só strings.
  const prologo = new Set<ts.Node>();
  for (const s of sf.statements) {
    if (!ehDiretiva(s)) break;
    prologo.add(s);
  }
  const texto = (n: ts.Node) => (ehDiretiva(n as ts.Statement) ? (n as ts.ExpressionStatement).expression.getText(sf).slice(1, -1) : undefined);
  const topo = [...prologo].some((s) => texto(s) === "use server");

  const visitar = (n: ts.Node) => {
    if (ehDiretiva(n) && texto(n) === "use server" && !prologo.has(n)) {
      erros.push(`${caminho}: "use server" fora do topo do arquivo não é permitido; use um arquivo de ações com acao().`);
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);

  const rota = ehRota(caminho);
  if (topo || rota) {
    const wrapper = rota ? ["rota"] : ["acao", "acaoPublica"];
    const legitimos = importsLegitimos(sf);
    for (const s of sf.statements) {
      if (!exportado(s)) continue;
      if (ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s)) continue;
      if (ts.isExportDeclaration(s) && s.isTypeOnly) continue;
      if (ts.isVariableStatement(s) && s.declarationList.declarations.length === 1 && s.declarationList.flags & ts.NodeFlags.Const) {
        const d = s.declarationList.declarations[0];
        const nome = ts.isIdentifier(d.name) ? d.name.text : undefined;
        if (rota && nome && CONFIG_ROTA.has(nome)) continue;
        const init = d.initializer;
        if (nome && init && ts.isCallExpression(init) && ts.isIdentifier(init.expression)) {
          const f = init.expression.text;
          if (wrapper.includes(f) && legitimos.has(f) && ligacoes(sf, f) === 1) continue;
        }
      }
      erros.push(`${caminho}: export fora de ${wrapper.join("/")}(): ${linha(s)}`);
    }
  }

  if (!publicas.includes(caminho)) {
    let usa = false;
    const achar = (n: ts.Node) => {
      if (ts.isImportSpecifier(n) && (n.propertyName ?? n.name).text === "acaoPublica") usa = true;
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "acaoPublica") usa = true;
      ts.forEachChild(n, achar);
    };
    achar(sf);
    if (usa) erros.push(`${caminho}: acaoPublica fora de ACOES_PUBLICAS.`);
  }
  return erros;
}

const IGNORADOS = new Set(["node_modules", ".next", ".git", ".vitest", "drizzle", "scripts"]);
const EXTENSAO = /\.[cm]?[jt]sx?$/;
const TESTE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

export function arquivosVerificados(raiz = process.cwd()): { caminho: string; codigo: string }[] {
  const achados: { caminho: string; codigo: string }[] = [];
  const andar = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (!IGNORADOS.has(e.name)) andar(abs);
      } else if (EXTENSAO.test(e.name) && !TESTE.test(e.name)) {
        achados.push({ caminho: relative(raiz, abs), codigo: readFileSync(abs, "utf8") });
      }
    }
  };
  andar(raiz);
  return achados;
}
