// Server client Supabase ligado aos cookies da request (RSC e Server
// Actions). Anon key — a autorização vem do JWT do usuário no cookie, não da
// service-role. Para dados de barbearia_001 continua sendo tenantDb().

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return { url, anon };
}

/** Client ligado ao cookie store da request. Em RSC o setAll é no-op (o
 *  proxy renova o cookie); em Server Action o setAll grava de verdade. */
export async function authServer() {
  const store = await cookies();
  const { url, anon } = env();
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {
          // RSC: cookies() é read-only aqui. O refresh acontece no proxy.
        }
      },
    },
  });
}

/** getUser() autoritativo (valida no Auth server). Redireciona pra /login
 *  se não houver usuário. Primeira linha das páginas protegidas. */
export async function requireUser(): Promise<User> {
  const supabase = await authServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

/** getUser() sem redirect — a página /login usa pra mandar quem já está
 *  logado direto pro /agenda. */
export async function getUserOpcional(): Promise<User | null> {
  const supabase = await authServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
