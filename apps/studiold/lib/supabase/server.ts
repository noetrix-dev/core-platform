// Cliente Supabase SÓ para o servidor (RSC, Server Actions, Route Handlers).
// Usa a service-role key e fala direto com o schema do tenant. Nunca importe
// isto de um Client Component — a checada abaixo quebra a execução se isso
// acontecer.
//
// Segurança (path A, decidida no chat): não há RLS em barbearia_001 nem Auth
// no app. O isolamento é: a service-role key nunca chega ao browser e todo
// acesso a esse schema passa por aqui, no servidor.

import { createClient } from "@supabase/supabase-js";

if (typeof window !== "undefined") {
  throw new Error("lib/supabase/server.ts foi importado no cliente");
}

/** slug do tenant = nome do schema Postgres isolado (ex.: "barbearia_001") */
export const TENANT_SCHEMA = process.env.NEXT_PUBLIC_TENANT ?? "barbearia_001";

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
    db: { schema: TENANT_SCHEMA },
  });
}

let cached: ReturnType<typeof makeClient> | null = null;

export function tenantDb(): ReturnType<typeof makeClient> {
  if (!cached) cached = makeClient();
  return cached;
}
