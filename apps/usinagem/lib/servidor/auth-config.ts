import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getIp, isAPIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { MENSAGEM_LOGIN_FALHOU, normalizarEmail, registroLogin, SENHA_MAX, SENHA_MIN } from "../dominio/seguranca/login";
import * as schema from "./db/schema";

type Banco = NodePgDatabase<typeof schema>;

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
          before: async (sessao) => {
            const [u] = await banco.select({ ativo: schema.usuarios.ativo }).from(schema.usuarios).where(eq(schema.usuarios.id, sessao.userId));
            return u?.ativo ? { data: sessao } : false;
          },
        },
      },
    },
    hooks: {
      // Defesa em profundidade: o filtro de rota (Task 8) é a primeira barreira.
      before: createAuthMiddleware(async (ctx) => {
        if (!(CAMINHOS_AUTH_PERMITIDOS as readonly string[]).includes(ctx.path)) throw new APIError("NOT_FOUND");
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email") return;
        const retorno = ctx.context.returned;
        const sucesso = !isAPIError(retorno) && Boolean(ctx.context.newSession);
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
