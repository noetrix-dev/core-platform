import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Barreira otimista: só olha se o cookie existe. A autoritativa é o requirePermissao em cada ação e página.
// getSessionCookie acha o nome com e sem o prefixo __Secure- (https).
export function proxy(request: NextRequest) {
  // Comparações exatas: produção nunca entra aqui, e "true"/"yes" não ligam o seletor.
  if (process.env.NODE_ENV === "development" && process.env.ENABLE_DEV_SWITCHER === "1") return NextResponse.next();
  if (getSessionCookie(request, { cookiePrefix: "usinagem" })) return NextResponse.next();
  return NextResponse.redirect(new URL("/entrar", request.url));
}

export const config = {
  // Exclusões ancoradas em "/" ou fim do caminho: /entrarx e /api/authx passam pelo proxy. dev/ só com a barra.
  matcher: ["/((?!(?:entrar|api/auth|_next/static|_next/image|favicon\\.ico)(?:/|$)|dev/).*)"],
};
