const PERMITIDOS = new Set(["POST /sign-in/email", "POST /sign-out", "GET /get-session"]);

/**
 * Deny by default: só os endpoints do Better Auth que o ERP usa. O resto responde 404.
 * Lê o mesmo `new URL(req.url).pathname` que o roteador do Better Auth (better-call router.mjs:29-37), então os dois
 * veem o caminho já normalizado pelo WHATWG (`..`, `%2e%2e`, `\`, tab e nova linha) e decidem sobre a mesma string.
 * Comparação exata: caixa, barra final, barra dupla, `%2F`, `;param` e sufixo ficam de fora.
 */
export function filtrarCaminhoAuth(req: Request, base = "/api/auth"): boolean {
  const { pathname } = new URL(req.url);
  if (!pathname.startsWith(`${base}/`)) return false;
  return PERMITIDOS.has(`${req.method} ${pathname.slice(base.length)}`);
}
