// Cliente Supabase SÓ para o servidor (RSC, Server Actions, Route Handlers).
// service-role key, fala direto com o schema financas. Nunca importar do client.
//
// Segurança (path A): não há RLS no schema financas nem autorização no app além
// do gate de sessão. O isolamento é: a service-role key nunca chega ao browser e
// todo acesso ao schema passa por aqui.

import { createClient } from "@supabase/supabase-js";

if (typeof window !== "undefined") {
  throw new Error("lib/supabase/server.ts foi importado no cliente");
}

const SCHEMA = "financas";

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente",
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: SCHEMA },
  });
}

let cached: ReturnType<typeof makeClient> | null = null;

export function financasDb(): ReturnType<typeof makeClient> {
  if (!cached) cached = makeClient();
  return cached;
}
