import { redirect } from "next/navigation";
import { getUserOpcional } from "@/lib/supabase/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrar — Finanças" };

export default async function LoginPage() {
  if (await getUserOpcional()) redirect("/cockpit");

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <h1 className="mb-1 text-2xl font-bold">Entrar</h1>
      <p className="mb-6 text-sm opacity-70">Acesso pessoal.</p>
      <LoginForm />
    </main>
  );
}
