import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getIp, isAPIError } from "better-auth/api";
import { and, eq, gt, lt, max, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  bloqueioAtivo,
  JANELA_FALHAS_MS,
  MENSAGEM_LOGIN_FALHOU,
  normalizarEmail,
  registroLogin,
  SENHA_MAX,
  SENHA_MIN,
} from "../dominio/seguranca/login";
import type { UsuarioSessao } from "../dominio/permissoes/acesso";
import type { Perfil } from "../dominio/permissoes/perfis";
import * as schema from "./db/schema";

type Banco = NodePgDatabase<typeof schema>;

/**
 * Usuário ativo cuja sessão nasceu depois da última troca de senha (contas.atualizado_em da conta credential); senão null.
 * Instante igual conta como anterior (falha fechado). Sem conta credential: null. Lido a cada chamada, sem cache.
 */
export async function usuarioDaSessao(banco: Banco, usuarioId: string, sessaoCriadaEm: Date): Promise<UsuarioSessao | null> {
  const { usuarios, contas } = schema;
  const [u] = await banco
    .select({ id: usuarios.id, nome: usuarios.nome, perfil: usuarios.perfilId })
    .from(usuarios)
    .innerJoin(contas, and(eq(contas.userId, usuarios.id), eq(contas.providerId, "credential")))
    .where(and(eq(usuarios.id, usuarioId), eq(usuarios.ativo, true), lt(contas.updatedAt, sessaoCriadaEm)));
  return u ? { ...u, perfil: u.perfil as Perfil } : null;
}

export const CAMINHOS_AUTH_PERMITIDOS = ["/sign-in/email", "/sign-out", "/get-session"] as const;
const DOZE_HORAS_S = 12 * 60 * 60;
const UMA_HORA_S = 60 * 60;

// Vazio ou só espaços conta como ausente.
const variavel = (nome: string): string | undefined => process.env[nome]?.trim() || undefined;

function segredo(): string {
  const s = variavel("BETTER_AUTH_SECRET");
  // Falha fechado: sem segredo forte não há auth.
  if (!s || s.length < 32) throw new Error("BETTER_AUTH_SECRET ausente ou curto.");
  return s;
}

// Header definido pelo proxy reverso confiável (ex.: x-real-ip). Fora de produção, ausente = nenhum header vale.
function cabecalhoIp(): string | undefined {
  const h = variavel("AUTH_IP_HEADER");
  if (!h && process.env.NODE_ENV === "production") throw new Error("AUTH_IP_HEADER ausente em produção.");
  return h;
}

export function criarAuth({ banco, plugins = [] }: { banco: Banco; plugins?: BetterAuthPlugin[] }) {
  const secret = segredo();
  const ipHeader = cabecalhoIp();
  const baseURL = variavel("BETTER_AUTH_URL");

  const idPorEmail = async (email: string): Promise<string | undefined> =>
    email ? (await banco.select({ id: schema.usuarios.id }).from(schema.usuarios).where(eq(schema.usuarios.email, email)))[0]?.id : undefined;

  // Falhas contadas do e-mail: login_falha depois do último login_desbloqueio, nas duas últimas janelas.
  // Pelo e-mail em `depois`, não pelo usuário: a mesma consulta roda para e-mail existente ou não.
  // ponytail: sem índice em (operacao, criado_em), varredura aceitável no volume atual; índice numa migration futura.
  const falhasContadas = async (email: string, agora: Date): Promise<Date[]> => {
    const a = schema.eventosAuditoria;
    const doEmail = sql`${a.depois}->>'email' = ${email}`;
    const desbloqueio = banco.select({ em: max(a.criadoEm) }).from(a).where(and(eq(a.operacao, "login_desbloqueio"), doEmail));
    const desde = new Date(agora.getTime() - 2 * JANELA_FALHAS_MS);
    const linhas = await banco
      .select({ em: a.criadoEm })
      .from(a)
      .where(and(eq(a.operacao, "login_falha"), doEmail, gt(a.criadoEm, sql`greatest(${desde}::timestamptz, coalesce((${desbloqueio}), '-infinity'::timestamptz))`)));
    return linhas.map((l) => l.em);
  };

  // Tentativas de login de e-mail bloqueado, pela chave `ctx.context`: objeto novo por despacho (dispatch.mjs:196), o mesmo
  // no hooks.before, no databaseHooks e no hooks.after (o corpo não serve: a validação do endpoint cria outro objeto).
  // A recusa não acontece no before: o Better Auth segue até a senha (uma derivação scrypt, como em qualquer tentativa),
  // e origem, CSRF e validação respondem igual para e-mail bloqueado ou livre (sem oráculo). Quem recusa é a criação de sessão.
  const bloqueados = new WeakSet<object>();
  // Início de cada login, pela mesma chave: vira o createdAt da sessão. Carimbado antes de o Better Auth ler o hash
  // (sign-in.mjs:287), então um login que leu o hash antigo nasce antes do atualizado_em de uma redefinição concorrente.
  const inicioDoLogin = new WeakMap<object, Date>();

  return betterAuth({
    secret,
    baseURL,
    trustedOrigins: baseURL ? [baseURL] : [],
    database: drizzleAdapter(banco, { provider: "pg", schema }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: SENHA_MIN, maxPasswordLength: SENHA_MAX },
    session: {
      modelName: "sessoes",
      expiresIn: DOZE_HORAS_S,
      // Expiração absoluta: token roubado não se estende com uso contínuo. Com updateAge de 1 h a trava é a única barreira.
      updateAge: UMA_HORA_S,
      disableSessionRefresh: true,
    },
    account: { modelName: "contas" },
    verification: { modelName: "verificacoes" },
    user: {
      modelName: "usuarios",
      fields: { name: "nome", emailVerified: "emailVerificado", createdAt: "criadoEm", updatedAt: "atualizadoEm" },
      additionalFields: {
        perfilId: { type: "string", required: true, input: false },
        ativo: { type: "boolean", required: false, defaultValue: true, input: false },
        ficticio: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    advanced: {
      database: { generateId: "uuid" },
      cookiePrefix: "usinagem",
      useSecureCookies: baseURL?.startsWith("https://") ?? false,
      // Explícito: em NODE_ENV=test o padrão do Better Auth desliga a checagem de origem.
      disableOriginCheck: false,
      // [] e não undefined: undefined faria o Better Auth confiar no x-forwarded-for.
      ipAddress: { ipAddressHeaders: ipHeader ? [ipHeader] : [] },
    },
    // ponytail: limite em memória, uma instância; storage "database" quando houver mais de uma.
    // Sem IP confiável o Better Auth usa um balde único por caminho, que também limita.
    rateLimit: { enabled: true, window: 60, max: 30, customRules: { "/sign-in/email": { window: 60, max: 5 } } },
    databaseHooks: {
      session: {
        create: {
          // Usuário inativo nunca recebe sessão. A senha já foi verificada pelo Better Auth (custo igual).
          before: async (sessao, ctx) => {
            if (ctx && bloqueados.has(ctx.context)) return false;
            const [u] = await banco.select({ ativo: schema.usuarios.ativo }).from(schema.usuarios).where(eq(schema.usuarios.id, sessao.userId));
            if (!u?.ativo) return false;
            // rememberMe: false faria a sessão valer 24 h (internal-adapter.mjs:199); o teto absoluto é 12 h.
            // Teto contado da criação real (agora), não do carimbo.
            const teto = Date.now() + DOZE_HORAS_S * 1000;
            const inicio = ctx ? inicioDoLogin.get(ctx.context) : undefined;
            return {
              data: { ...sessao, ...(inicio ? { createdAt: inicio } : {}), expiresAt: new Date(Math.min(new Date(sessao.expiresAt).getTime(), teto)) },
            };
          },
        },
      },
    },
    hooks: {
      // Defesa em profundidade: o filtro de rota (Task 8) é a primeira barreira.
      before: createAuthMiddleware(async (ctx) => {
        if (!(CAMINHOS_AUTH_PERMITIDOS as readonly string[]).includes(ctx.path)) throw new APIError("NOT_FOUND");
        if (ctx.path === "/sign-in/email" && ctx.body && typeof ctx.body === "object") {
          // O destino pós-login é do app (destinoSeguro), nunca do corpo: auth.api sem request não valida callbackURL.
          // Mutação em vez de `{ context: { body } }`: o merge do dispatch (defu) manteria a chave original.
          const corpo = ctx.body as Record<string, unknown>;
          delete corpo.callbackURL;
          delete corpo.errorCallbackURL;
        }
        if (ctx.path === "/sign-in/email") {
          // Sempre, exista o e-mail ou não: mesma consulta, mesmo tempo. E-mail desconhecido não tem linhas e nunca bloqueia.
          const agora = new Date();
          inicioDoLogin.set(ctx.context, agora);
          const bloqueado = bloqueioAtivo(await falhasContadas(normalizarEmail((ctx.body as { email?: unknown } | undefined)?.email), agora), agora);
          if (bloqueado) bloqueados.add(ctx.context);
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/get-session") {
          // Nenhuma autorização usa este endpoint (só usuarioAtual/requirePermissao), mas ele não mostra sessão obsoleta nem de inativo.
          const r = ctx.context.returned as { session?: { userId: string; createdAt: Date | string } } | null | undefined;
          if (r && !isAPIError(r) && r.session && !(await usuarioDaSessao(banco, r.session.userId, new Date(r.session.createdAt)))) return ctx.json(null);
          return;
        }
        if (ctx.path !== "/sign-in/email") return;
        const retorno = ctx.context.returned;
        const sucesso = !isAPIError(retorno) && Boolean(ctx.context.newSession);
        const bloqueado = bloqueados.delete(ctx.context);
        // 401 = credencial: senha errada, e-mail inexistente ou sessão recusada (inativo). Origem e validação passam intactas.
        const falhaDeCredencial = isAPIError(retorno) && retorno.statusCode === 401;
        if (sucesso || falhaDeCredencial) {
          const email = normalizarEmail((ctx.body as { email?: unknown } | undefined)?.email);
          const usuarioId = ctx.context.newSession?.user.id ?? (await idPorEmail(email));
          // E-mail desconhecido não grava nada.
          if (usuarioId) {
            const cabecalhos = ctx.request?.headers ?? ctx.headers;
            await banco.insert(schema.eventosAuditoria).values(
              registroLogin({
                email,
                sucesso,
                // Recusa por bloqueio: login_bloqueado, que não conta para o limite (não estende o bloqueio).
                bloqueado,
                // O mesmo resolvedor do rate limit e da sessão; registroLogin ainda valida.
                ip: cabecalhos ? getIp(cabecalhos, ctx.context.options) : null,
                userAgent: cabecalhos?.get("user-agent") ?? null,
                usuarioId,
              }),
            );
          }
        }
        if (falhaDeCredencial) throw new APIError("UNAUTHORIZED", { code: "INVALID_EMAIL_OR_PASSWORD", message: MENSAGEM_LOGIN_FALHOU });
      }),
    },
    plugins,
  });
}

export type Auth = ReturnType<typeof criarAuth>;
