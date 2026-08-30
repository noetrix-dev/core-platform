"use server";

import { redirect } from "next/navigation";
import { authServer } from "@/lib/supabase/auth";

export type EntrarEstado = { erro: string | null };

export async function entrar(
  _prev: EntrarEstado,
  fd: FormData,
): Promise<EntrarEstado> {
  const email = (fd.get("email") ?? "").toString().trim();
  const senha = (fd.get("senha") ?? "").toString();
  if (!email || !senha) return { erro: "Preencha e-mail e senha." };

  const supabase = await authServer();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (error) return { erro: "E-mail ou senha incorretos." };

  redirect("/agenda");
}
