import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "../../../../lib/servidor/auth";
import { filtrarCaminhoAuth } from "../../../../lib/servidor/handler-auth";

// Isento do wrapper rota(): é o próprio endpoint de autenticação (ROTAS_ISENTAS).
// Allowlist de caminhos; rate limit e origem no auth-config.ts.
// auth() só dentro da chamada: o `next build` importa este módulo sem segredo nem banco.
const naoEncontrado = () => new Response(null, { status: 404 });
export const GET = (req: Request) => (filtrarCaminhoAuth(req) ? toNextJsHandler(auth()).GET(req) : naoEncontrado());
export const POST = (req: Request) => (filtrarCaminhoAuth(req) ? toNextJsHandler(auth()).POST(req) : naoEncontrado());
