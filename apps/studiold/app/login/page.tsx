import { redirect } from "next/navigation";
import { getUserOpcional } from "@/lib/supabase/auth";
import { LoginForm } from "./LoginForm";
import styles from "@/app/agenda/agenda.module.css";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getUserOpcional()) redirect("/agenda");

  return (
    <div className={styles.shell}>
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático */}
        <img
          src="/studiold-logo.svg"
          alt="StudiOLD"
          className="mb-8 h-10 w-auto self-start"
          style={{ filter: "brightness(0) invert(1)" }}
        />
        <h1 className="mb-1 text-lg font-semibold">Entrar</h1>
        <p className={`${styles.slip__meta} mb-6`}>Acesso restrito à equipe.</p>
        <LoginForm />
      </main>
    </div>
  );
}
