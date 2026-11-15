import "server-only";
import { nextCookies } from "better-auth/next-js";
import { criarAuth, type Auth } from "./auth-config";
import { db } from "./db";

let instancia: Auth | undefined;

// Lazy: `next build` importa sem segredo nem banco; as checagens de ambiente só rodam aqui, na primeira chamada.
// nextCookies() precisa ser o último plugin.
export function auth(): Auth {
  instancia ??= criarAuth({ banco: db(), plugins: [nextCookies()] });
  return instancia;
}
