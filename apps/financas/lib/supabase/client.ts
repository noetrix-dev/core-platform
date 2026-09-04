// Client Supabase do browser (anon key). A sessão vive em cookie, gerida
// pelo @supabase/ssr. Só componentes de cliente importam isto — hoje, só o
// botão de logout. Acesso a dados de barbearia_001 continua em tenantDb().

import { createBrowserClient } from "@supabase/ssr";

export function browserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return createBrowserClient(url, anon);
}
