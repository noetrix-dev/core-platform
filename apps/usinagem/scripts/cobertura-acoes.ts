import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

/** Rotas que não passam pelo wrapper, com motivo. Caminho exato; cada entrada é revisada. */
export const ROTAS_ISENTAS: readonly string[] = [
  // Endpoint do próprio Better Auth: é ele que cria a sessão, então não há sessão para rota() checar. A barreira é a
  // allowlist de caminhos (filtrarCaminhoAuth, só sign-in/email, sign-out e get-session) mais o hooks.before do auth-config.
  "app/api/auth/[...all]/route.ts",
];
/** Arquivos autorizados a usar acaoPublica (ação sem sessão por natureza, ex.: login). Cada entrada é revisada. */
export const ACOES_PUBLICAS: readonly string[] = [
  // sair: precisa funcionar sem sessão válida (obsoleta, de conta inativa ou já apagada) para expirar o cookie. Não lê
  // nem altera dado de negócio: só auth().api.signOut com os headers da request e redirect("/entrar").
  "app/entrar/acoes.ts",
];

const MODULO_WRAPPER = "lib/servidor/acao";
const LEITURA_DE_SESSAO = new Set(["getSession", "useSession"]);
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
  // Valor decodificado: "use\x20server" também é a diretiva.
  const texto = (n: ts.Node) => (ehDiretiva(n as ts.Statement) ? ((n as ts.ExpressionStatement).expression as ts.StringLiteral).text : undefined);
  const topo = [...prologo].some((s) => texto(s) === "use server");

  const visitar = (n: ts.Node) => {
    if (ehDiretiva(n) && texto(n) === "use server" && !prologo.has(n)) {
      erros.push(`${caminho}: "use server" fora do topo do arquivo não é permitido; use um arquivo de ações com acao().`);
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);

  // new ErroDominio(x): só mensagem constante. Mensagem montada em runtime pode carregar valor de linha para o log.
  const constantes = new Set<string>();
  for (const s of sf.statements) {
    if (!ts.isVariableStatement(s) || !(s.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const d of s.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.initializer && (ts.isStringLiteral(d.initializer) || ts.isNoSubstitutionTemplateLiteral(d.initializer))) constantes.add(d.name.text);
    }
  }
  const constante = (a: ts.Expression) =>
    ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a) || (ts.isIdentifier(a) && constantes.has(a.text));
  const achaErro = (n: ts.Node) => {
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "ErroDominio") {
      const args = n.arguments ?? [];
      if (args.length > 1 || (args.length === 1 && !constante(args[0]))) erros.push(`${caminho}: ErroDominio com mensagem não constante: ${linha(n)}`);
    }
    ts.forEachChild(n, achaErro);
  };
  achaErro(sf);

  // Toda referência a ErroDominio precisa ser analisável: alias, namespace e atribuição a variável escapariam da regra acima.
  const ehComum = /(^|\/)lib\/dominio\/comum\.ts$/.test(caminho);
  const naoTipo = (n: ts.Node) => {
    for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
      // `class X extends ErroDominio` herda comportamento de valor, não é só tipo.
      if (ts.isExpressionWithTypeArguments(p) && ts.isHeritageClause(p.parent) && p.parent.token === ts.SyntaxKind.ExtendsKeyword && ts.isClassLike(p.parent.parent)) return true;
      if (ts.isTypeNode(p)) return false;
    }
    return true;
  };
  const achaReferencia = (n: ts.Node) => {
    if (ts.isImportSpecifier(n)) {
      const alvo = n.propertyName?.text;
      if (alvo !== undefined && alvo !== n.name.text && (alvo === "ErroDominio" || n.name.text === "ErroDominio")) {
        erros.push(`${caminho}: import de ErroDominio com alias: ${linha(n)}`);
      }
      return;
    }
    if (ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression) && n.argumentExpression.text === "ErroDominio") {
      erros.push(`${caminho}: acesso dinâmico a ErroDominio: ${linha(n)}`);
    }
    if (ts.isIdentifier(n) && n.text === "ErroDominio" && naoTipo(n)) {
      const p = n.parent;
      const ok =
        (ts.isNewExpression(p) && p.expression === n) ||
        (ts.isClassDeclaration(p) && p.name === n && ehComum) ||
        (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword && p.right === n) ||
        (ts.isImportSpecifier(p) && p.name === n && !p.propertyName);
      if (!ok) erros.push(`${caminho}: referência a ErroDominio fora de new, instanceof ou import: ${linha(p)}`);
    }
    ts.forEachChild(n, achaReferencia);
  };
  achaReferencia(sf);

  const rota = ehRota(caminho);
  if (topo || rota) {
    const wrapper = rota ? ["rota"] : ["acao", "acaoSensivel", "acaoPublica"];
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

  // Sessão do Better Auth só se lê em lib/servidor/sessao.ts (usuarioAtual), que relê ativo e a troca de senha.
  // Qualquer forma conta: propriedade, colchete, desestruturação, import com ou sem alias, referência solta.
  if (caminho !== "lib/servidor/sessao.ts") {
    const achaSessao = (n: ts.Node) => {
      if ((ts.isIdentifier(n) || ts.isStringLiteralLike(n)) && LEITURA_DE_SESSAO.has(n.text)) {
        erros.push(`${caminho}: getSession/useSession fora de lib/servidor/sessao.ts: ${linha(n.parent ?? n)}`);
      }
      ts.forEachChild(n, achaSessao);
    };
    achaSessao(sf);
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

// Em qualquer profundidade (dependências e build) e só na raiz do app (tooling próprio; `app/x/scripts` é código do app).
/** Mensagens literais (ou const de módulo literal) de `new ErroDominio(...)`; o que não é constante o scanner já recusa. */
export function mensagensDeErroDominio(codigo: string): string[] {
  const sf = ts.createSourceFile("x.ts", codigo, ts.ScriptTarget.Latest, true);
  const consts = new Map<string, string>();
  for (const s of sf.statements) {
    if (!ts.isVariableStatement(s)) continue;
    for (const d of s.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.initializer && ts.isStringLiteralLike(d.initializer)) consts.set(d.name.text, d.initializer.text);
    }
  }
  const msgs: string[] = [];
  const achar = (n: ts.Node) => {
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "ErroDominio" && n.arguments?.length === 1) {
      const a = n.arguments[0];
      if (ts.isStringLiteralLike(a)) msgs.push(a.text);
      else if (ts.isIdentifier(a) && consts.has(a.text)) msgs.push(consts.get(a.text)!);
    }
    ts.forEachChild(n, achar);
  };
  achar(sf);
  return msgs;
}

const IGNORADOS_SEMPRE = new Set(["node_modules", ".next", ".git"]);
const IGNORADOS_NA_RAIZ = new Set([".vitest", "drizzle", "scripts"]);
const EXTENSAO = /\.[cm]?[jt]sx?$/;
const TESTE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

export function arquivosVerificados(raiz = process.cwd()): { caminho: string; codigo: string }[] {
  const achados: { caminho: string; codigo: string }[] = [];
  const andar = (dir: string, naRaiz: boolean) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (!IGNORADOS_SEMPRE.has(e.name) && !(naRaiz && IGNORADOS_NA_RAIZ.has(e.name))) andar(abs, false);
      } else if (EXTENSAO.test(e.name) && !TESTE.test(e.name)) {
        achados.push({ caminho: relative(raiz, abs), codigo: readFileSync(abs, "utf8") });
      }
    }
  };
  andar(raiz, true);
  return achados;
}

const MODULO_CATALOGO = "lib/dominio/permissoes/catalogo";
const ehModuloCatalogo = (spec: string) => spec === `@/${MODULO_CATALOGO}` || ((spec.startsWith("./") || spec.startsWith("../")) && /(^|\/)catalogo$/.test(spec));

/** Arquivos (fora de testes) que chamam `pode` importado do catálogo, inclusive por alias (`pode as p`) ou namespace (`ns.pode(`). */
export function arquivosQueChamamPode(raiz = process.cwd()): string[] {
  return arquivosVerificados(raiz)
    .filter(({ caminho, codigo }) => {
      const sf = ts.createSourceFile(caminho, codigo, ts.ScriptTarget.Latest, true);
      const nomes = new Set<string>();
      const espacos = new Set<string>();
      for (const s of sf.statements) {
        if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier) || !ehModuloCatalogo(s.moduleSpecifier.text)) continue;
        const b = s.importClause?.namedBindings;
        if (s.importClause?.isTypeOnly || !b) continue;
        if (ts.isNamespaceImport(b)) espacos.add(b.name.text);
        else for (const e of b.elements) if (!e.isTypeOnly && (e.propertyName ?? e.name).text === "pode") nomes.add(e.name.text);
      }
      let chama = false;
      const achar = (n: ts.Node) => {
        if (ts.isCallExpression(n)) {
          const f = n.expression;
          if (ts.isIdentifier(f) && nomes.has(f.text)) chama = true;
          if (ts.isPropertyAccessExpression(f) && f.name.text === "pode" && ts.isIdentifier(f.expression) && espacos.has(f.expression.text)) chama = true;
        }
        ts.forEachChild(n, achar);
      };
      achar(sf);
      return chama;
    })
    .map((a) => a.caminho)
    .sort();
}
