"use client";

import { browserSupabase } from "@/lib/supabase/client";

export function LogoutButton() {
  async function sair() {
    await browserSupabase().auth.signOut({ scope: "local" });
    location.assign("/login");
  }
  return (
    <button onClick={sair} className="text-sm underline">
      Sair
    </button>
  );
}
