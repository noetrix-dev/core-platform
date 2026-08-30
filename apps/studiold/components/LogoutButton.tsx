"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupabase } from "@/lib/supabase/client";
import { Icon } from "@/components/agenda/Icon";
import styles from "@/app/agenda/agenda.module.css";

export function LogoutButton() {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  const sair = async () => {
    if (saindo) return;
    setSaindo(true);
    try {
      await browserSupabase().auth.signOut();
    } catch {
      // mesmo que o signOut falhe no servidor, o cookie local é limpo;
      // seguimos pro /login e o proxy resolve o resto.
    }
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      type="button"
      className={`${styles.navItem} w-full`}
      onClick={sair}
      disabled={saindo}
    >
      <Icon name="lock" size={17} /> {saindo ? "Saindo…" : "Sair"}
    </button>
  );
}
