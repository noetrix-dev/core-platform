import type { ReactNode } from "react";
import { Topbar } from "@/components/Topbar";
import { requireUser } from "@/lib/supabase/auth";
import styles from "@/app/agenda/agenda.module.css";
import { SecondaryNav } from "./SecondaryNav";

export default async function ConfiguracoesLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireUser();
  return (
    <div className={styles.shell}>
      <Topbar titulo="Configurações" />
      <SecondaryNav />
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
        {children}
      </main>
    </div>
  );
}
